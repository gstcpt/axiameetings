import { NextRequest } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getStreamingClient, trackUsage, generateWithRetry, getChatResponse } from '@/lib/ai-provider';
import { createLog } from '@/lib/logger';

// ─── Platform knowledge base ───────────────────────────────────────────────
const PLATFORM_KNOWLEDGE = `
Axia Meetings is a digital governance platform designed for property syndics (syndics de copropriété) and corporate boards.

IMPORTANT — WHAT THIS APP DOES AND DOES NOT HAVE:
- There is NO sign-up / registration page. Users are created by administrators only.
- There is NO "forgot password" self-service. Contact your administrator.
- The only public pages are: Home (/), Login (/auth/login), Terms of Use (/terms-of-use), Privacy Policy (/privacy-policy), and meeting invitation/join pages (/meetings/[id]/join).
- To access the platform, users go to the Login page and enter their username and password provided by their administrator.

AUTHENTICATED PAGES (require login):
- /overview — Dashboard overview with stats and calendar
- /meetings — List of meetings, create new meetings
- /meetings/[id] — Meeting details, agenda, participants, documents, AI summary
- /meetings/[id]/pv — Meeting minutes (PV) viewer and Word export
- /meetings/[id]/live — Live meeting session (real-time voting, agenda, hand-raising)
- /users — User management (ADMIN and DEVELOPER only)
- /companies — Company management (DEVELOPER only)
- /companies/admins — Company administrators (DEVELOPER only)
- /companies/apis — API endpoints configuration (DEVELOPER only)
- /companies/configure — Service configuration (DEVELOPER only)
- /companies/link — Account linking (DEVELOPER only)
- /configurations — System settings: SMTP, branding, legal (DEVELOPER only)
- /logs — System activity logs with AI analysis (DEVELOPER only)
- /packs — Pricing packs management (DEVELOPER only)
- /references — References management (DEVELOPER only)
- /newsletters — Newsletter subscribers (DEVELOPER only)
- /chat-sessions — Chatbot conversation history (DEVELOPER only)

KEY FEATURES:
- Digital meeting management: create, schedule, and run meetings (Ordinary, Extraordinary, Complementary, Delegates)
- Meeting modes: In-Person, Online, Hybrid
- Live sessions: real-time agenda navigation, live voting, hand-raising for word requests
- Automated PV (Procès-Verbal / Meeting Minutes): generated automatically when a meeting ends
- AI features: AI-generated meeting summaries, AI-suggested agenda points, AI description polish, AI log analysis
- Participant management: invite participants via email with secure one-click join links (no account needed)
- Document management: attach documents to meetings
- Company management: multi-tenant support for multiple organizations
- User roles: DEVELOPER (platform admin), ADMIN (company manager), PARTICIPANT (meeting attendee)
- Legal compliance: eIDAS-compliant voting, cryptographic time-stamping
- Multi-language: English, French, Arabic

MEETING WORKFLOW:
1. Admin creates a meeting with subject, date, time, location, agenda points, participants
2. Participants receive email invitations with secure links — they do NOT need an account
3. Admin starts the meeting → live session opens for everyone
4. Agenda points are presented one by one; vote points trigger live voting
5. Participants can raise hands to request the floor
6. Admin ends the meeting → PV is automatically generated
7. PV can be exported as Word (.docx) or printed

USER ROLES:
- DEVELOPER: full platform access, manages all companies, users, configurations, logs
- ADMIN: manages their company's meetings, users, API integrations
- PARTICIPANT: joins meetings via invitation link, votes, follows agenda (no dashboard access)

VOTING:
- Vote types: Pour (Yes/OUI), Contre (No/NON), Abstention (NEUTRE)
- Votes are recorded in real-time and shown in the PV

LIVE SESSION:
- Participants join via secure token link sent by email
- Access requests must be approved by the admin
- Hand-raising system for requesting the floor
- Real-time sync via Socket.io

NAVIGATION GUIDANCE:
- Not logged in? → Go to /auth/login and enter your credentials
- Forgot credentials? → Contact your company administrator
- Want to join a meeting? → Use the link sent to your email
- Want to create a meeting? → Go to /meetings after logging in
`;

// ─── Build role-based system prompt ────────────────────────────────────────
async function buildSystemPrompt(
    role: string | null,
    userId: number | null,
    companyId: number | null,
    locale: string,
    meetingId?: number
): Promise<string> {
    const langInstruction = locale === 'ar'
        ? 'Always respond in Arabic (العربية). Use RTL-formatting.'
        : locale === 'fr'
            ? 'Always respond in French.'
            : 'Always respond in English.';

    const base = `You are Axia Support, the helpful assistant for the Axia Meetings platform.
${langInstruction}
Be concise, friendly, and professional. Use bullet points for lists.
Never make up data — only report what you actually have.

${PLATFORM_KNOWLEDGE}`;

    // ── PUBLIC / unauthenticated ──────────────────────────────────────────
    if (!role || !userId) {
        // Fetch contact info from app_settings to give to unauthenticated users
        let contactInfo = '';
        try {
            const settings = await prisma.app_settings.findFirst({
                select: {
                    contact_phone: true,
                    contact_email: true,
                    contact_adress: true,
                    facebook: true,
                    linkedin: true,
                    tiktok: true,
                    from_name: true,
                },
            });
            if (settings) {
                const lines: string[] = [];
                if (settings.from_name) lines.push(`Platform name: ${settings.from_name}`);
                if (settings.contact_email) lines.push(`Email: ${settings.contact_email}`);
                if (settings.contact_phone) lines.push(`Phone: ${settings.contact_phone}`);
                if (settings.contact_adress) lines.push(`Address: ${settings.contact_adress}`);
                if (settings.facebook) lines.push(`Facebook: ${settings.facebook}`);
                if (settings.linkedin) lines.push(`LinkedIn: ${settings.linkedin}`);
                if (settings.tiktok) lines.push(`TikTok: ${settings.tiktok}`);
                if (lines.length > 0) {
                    contactInfo = `\n\nCONTACT INFORMATION (share this when users ask how to reach us):\n${lines.join('\n')}`;
                }
            }
        } catch { /* ignore */ }

        return `${base}

CONTEXT: You are talking to a visitor who is not logged in.
Help them understand what Axia Meetings is, its features, and how to get started.
If they want to contact us or need support, provide the contact information below.
Do not discuss internal data or user-specific information.${contactInfo}`;
    }

    // ── PARTICIPANT in a meeting ──────────────────────────────────────────
    if (role === 'PARTICIPANT') {
        let meetingContext = '';
        if (meetingId) {
            try {
                const meeting = await prisma.meetings.findUnique({
                    where: { id: meetingId },
                    include: {
                        meetings_points: {
                            orderBy: { id: 'asc' },
                            include: {
                                meetings_votes: true,
                            },
                        },
                        meetings_participants: { select: { email: true } },
                    },
                });
                if (meeting) {
                    const points = meeting.meetings_points.map((p: any, i: number) =>
                        `  ${i + 1}. [${p.type}] ${p.point} (votes: ${p.meetings_votes?.length ?? 0})`
                    ).join('\n');
                    meetingContext = `
CURRENT MEETING CONTEXT:
- Subject: ${meeting.subject}
- Type: ${meeting.type}
- Date: ${meeting.date} at ${meeting.time}
- Mode: ${meeting.mode}
- Status: ${meeting.status}
- Participants: ${meeting.meetings_participants.length}
- Agenda points:
${points}`;
                }
            } catch { /* ignore */ }
        }

        return `${base}

CONTEXT: You are talking to a meeting participant.
${meetingContext}
Help them understand how to participate: how to vote, how to raise their hand, how to follow the agenda.
Do not discuss other meetings or company data.`;
    }

    // ── ADMIN ─────────────────────────────────────────────────────────────
    if (role === 'ADMIN' && companyId) {
        try {
            const [company, meetings, users] = await Promise.all([
                prisma.companies.findUnique({
                    where: { id: companyId },
                    select: { name: true, url: true },
                }),
                prisma.meetings.findMany({
                    where: { company_id: companyId },
                    orderBy: { created_at: 'desc' },
                    take: 20,
                    select: {
                        id: true, subject: true, type: true, date: true,
                        time: true, status: true, mode: true,
                    },
                }),
                prisma.users.findMany({
                    where: { company_id: companyId },
                    select: { id: true, fullname: true, email: true, role: true },
                }),
            ]);

            const meetingsSummary = meetings.map(m =>
                `  - [${m.status}] ${m.subject} (${m.type}) — ${m.date} ${m.time} [${m.mode}] ID:${m.id}`
            ).join('\n');

            const usersSummary = users.map(u =>
                `  - ${u.fullname || u.email} (${u.role})`
            ).join('\n');

            return `${base}

CONTEXT: You are talking to an ADMIN of company "${company?.name || companyId}".
Only discuss data belonging to their company. Do not reveal other companies' data.

THEIR COMPANY DATA:
Company: ${company?.name} | URL: ${company?.url}
Total meetings: ${meetings.length}
Recent meetings:
${meetingsSummary || '  (none)'}

Users (${users.length} total):
${usersSummary || '  (none)'}

Help them manage their meetings, understand platform features, and use the system effectively.`;
        } catch {
            return `${base}\n\nCONTEXT: Admin user. Help them manage their meetings and use the platform.`;
        }
    }

    // ── DEVELOPER ─────────────────────────────────────────────────────────
    if (role === 'DEVELOPER') {
        try {
            const [companies, totalMeetings, totalUsers, recentLogs] = await Promise.all([
                prisma.companies.findMany({
                    select: { id: true, name: true },
                    orderBy: { id: 'asc' },
                }),
                prisma.meetings.count(),
                prisma.users.count(),
                prisma.logs.findMany({
                    orderBy: { timestamp: 'desc' },
                    take: 10,
                    select: { message: true, timestamp: true },
                }),
            ]);

            const companiesList = companies.map(c => `  - [${c.id}] ${c.name}`).join('\n');
            const logsList = recentLogs.map(l =>
                `  - ${new Date(l.timestamp).toISOString().slice(0, 16)}: ${l.message}`
            ).join('\n');

            return `${base}

CONTEXT: You are talking to a DEVELOPER (platform administrator) with full access.

PLATFORM STATS:
- Total companies: ${companies.length}
- Total meetings: ${totalMeetings}
- Total users: ${totalUsers}

Companies:
${companiesList || '  (none)'}

Recent activity (last 10 logs):
${logsList || '  (none)'}

You can answer questions about any company, meeting, user, or system configuration.
Help them manage the platform, debug issues, and understand system behavior.`;
        } catch {
            return `${base}\n\nCONTEXT: Developer with full platform access.`;
        }
    }

    return base;
}

// ─── GET: Fetch chat sessions (DEVELOPER only) ─────────────────────────────
export async function GET(req: NextRequest) {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser || authUser.role !== 'DEVELOPER') {
        return Response.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { searchParams } = new URL(req.url);
        const page = Number(searchParams.get('page') || 1);
        const limit = Number(searchParams.get('limit') || 20);
        const skip = (page - 1) * limit;

        const [sessions, total] = await Promise.all([
            prisma.chat_sessions.findMany({
                orderBy: { id: 'desc' },
                skip,
                take: limit,
            }),
            prisma.chat_sessions.count(),
        ]);

        return Response.json({ status: true, data: sessions, total, page, limit });
    } catch (error: any) {
        return Response.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// ─── PATCH: Mark session as closed ─────────────────────────────────────────
export async function PATCH(req: NextRequest) {
    try {
        const { sessionId } = await req.json();
        if (!sessionId) return new Response('sessionId required', { status: 400 });
        await (prisma.chat_sessions as any).updateMany({
            where: { session_id: sessionId },
            data: { is_closed: true },
        });
        return Response.json({ status: true });
    } catch {
        return Response.json({ status: false }, { status: 500 });
    }
}

// ─── POST: Send a chat message ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // Handle close signal from sendBeacon
        if (body._close && body.sessionId) {
            await (prisma.chat_sessions as any).updateMany({
                where: { session_id: body.sessionId },
                data: { is_closed: true },
            }).catch(() => { });
            return new Response('ok', { status: 200 });
        }

        const { messages, locale = 'en', meetingId, sessionId } = body;

        if (!messages || !Array.isArray(messages) || !sessionId) {
            return new Response('Invalid request — sessionId required', { status: 400 });
        }

        // Get user from JWT
        const authUser = await getAuthenticatedUser(req);
        const role = authUser?.role ?? null;
        const userId = authUser?.userId ?? null;
        const companyId = authUser?.companyId ?? null;

        // Build role-aware system prompt
        const systemPrompt = await buildSystemPrompt(
            role, userId, companyId, locale,
            meetingId ? Number(meetingId) : undefined
        );

        // Call Groq with streaming (DB key with usage tracking)
        // Falls back to generateWithRetry (Gemini/OpenRouter) if no Groq key available
        const groqSession = await getStreamingClient();

        let fullResponse = '';
        const encoder = new TextEncoder();
        let readable: ReadableStream;

        if (groqSession) {
            // ── Groq streaming path ──────────────────────────────────────
            const { client: groqClient, tokenId: groqTokenId } = groqSession;
            const stream = await groqClient.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...messages.slice(-10),
                ],
                stream: true,
                max_tokens: 1024,
                temperature: 0.7,
            });

            readable = new ReadableStream({
                async start(controller) {
                    try {
                        for await (const chunk of stream) {
                            const text = chunk.choices[0]?.delta?.content || '';
                            if (text) {
                                fullResponse += text;
                                controller.enqueue(encoder.encode(text));
                            }
                        }
                    } finally {
                        controller.close();
                        await trackUsage(groqTokenId, 'chat', true).catch(() => { });
                        await saveChatSession();
                    }
                },
            });
        } else {
            // ── Non-streaming fallback: Gemini → Groq → OpenRouter ───────
            try {
                const fullPrompt = `${systemPrompt}\n\n${messages.slice(-10).map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}\nAssistant:`;
                fullResponse = await getChatResponse(fullPrompt, { maxOutputTokens: 1024 });
            } catch (err: any) {
                return new Response(
                    JSON.stringify({ error: 'No AI provider available. Add API keys in AI Tokens settings.' }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                );
            }
            // Stream the pre-generated response word by word for consistent UX
            readable = new ReadableStream({
                async start(controller) {
                    const words = fullResponse.split(' ');
                    for (const word of words) {
                        controller.enqueue(encoder.encode(word + ' '));
                        await new Promise(r => setTimeout(r, 15));
                    }
                    controller.close();
                    await saveChatSession();
                },
            });
        }

        async function saveChatSession() {
            const allMessages = [
                ...messages,
                { role: 'assistant', content: fullResponse },
            ];
            try {
                const isNew = !(await (prisma.chat_sessions as any).findUnique({ where: { session_id: sessionId } }));

                await (prisma.chat_sessions as any).upsert({
                    where: { session_id: sessionId },
                    update: {
                        messages: allMessages,
                        locale,
                        ...(userId && { user_id: userId }),
                        ...(role && { role }),
                    },
                    create: {
                        session_id: sessionId,
                        user_id: userId,
                        role: role ?? 'PUBLIC',
                        locale,
                        messages: allMessages,
                        is_closed: false,
                    },
                });

                if (isNew) {
                    await createLog({
                        userId,
                        companyId,
                        message: `New AI Chat session started: ${sessionId}`,
                        payload: { locale, role: role ?? 'PUBLIC' },
                    });
                }
            } catch (e) {
                console.error('Failed to save chat session:', e);
            }
        }

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
                'Cache-Control': 'no-cache',
            },
        });
    } catch (error: any) {
        console.error('Chat API error:', error?.message || error);
        return new Response(
            JSON.stringify({ error: 'Failed to process chat request' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
// ─── DELETE: Remove session(s) (DEVELOPER only) ─────────────────────────────
export async function DELETE(req: NextRequest) {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser || authUser.role !== 'DEVELOPER') {
        return Response.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const body = await req.json();
        const { id, ids } = body;

        if (id) {
            await (prisma.chat_sessions as any).delete({ where: { id } });
            await createLog({
                userId: authUser.userId,
                companyId: authUser.companyId,
                message: `Deleted chat session ID: ${id}`,
                payload: { id }
            });
        } else if (ids && Array.isArray(ids)) {
            await (prisma.chat_sessions as any).deleteMany({ where: { id: { in: ids } } });
            await createLog({
                userId: authUser.userId,
                companyId: authUser.companyId,
                message: `Deleted multiple chat sessions: ${ids.length}`,
                payload: { ids }
            });
        } else {
            return Response.json({ status: false, message: 'ID or IDs required' }, { status: 400 });
        }

        return Response.json({ status: true });
    } catch (error: any) {
        console.error('Delete chat error:', error);
        return Response.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
