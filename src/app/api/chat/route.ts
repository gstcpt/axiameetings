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

const TOOL_INSTRUCTIONS = `
CRITICAL TOOL CALLING & OUTPUT SECURITY RULES:
1. You have access to a tool/function called 'fetchApplicationData' that can query internal APIs.
2. If the user asks about specific data (e.g. "who attended meeting 14", "how many participants in Réunion 3", "how many canceled meetings do I have", "show my users", "how many users are there", "what is the phone number of user X"), YOU MUST CALL THE 'fetchApplicationData' TOOL silently to get the actual data before responding.
3. IMPORTANT: The lists in your context (like Recent meetings, Users) are only basic overviews. They do NOT contain sub-resources like participant lists, attendee lists, agenda points, or documents. If the user asks for details, counts, or lists of participants, agenda points, or documents for any meeting, you DO NOT have this data in your context and MUST call the 'fetchApplicationData' tool with the correct endpoint to get it.
   AVAILABLE ENDPOINTS:
   - Meeting participants list/count: /api/meetings/[id]/participants
   - Meeting agenda points list/count: /api/meetings/[id]/points
   - Meeting documents list/count: /api/meetings/[id]/documents
   - Users list/count: /api/users
   - Current company details: /api/companies/my
4. To call this tool in a text-based format, you MUST output a single XML-like tag in your response:
   <function=fetchApplicationData>{"endpoint": "/api/meetings/[id]/participants"}</function>
   Replace "[id]" with the actual meeting ID.
   For example, to get participants of meeting 14:
   <function=fetchApplicationData>{"endpoint": "/api/meetings/14/participants"}</function>
   To get agenda points of meeting 14:
   <function=fetchApplicationData>{"endpoint": "/api/meetings/14/points"}</function>
   To get documents of meeting 14:
   <function=fetchApplicationData>{"endpoint": "/api/meetings/14/documents"}</function>
5. When you need to call the tool, output ONLY the tool call tag and nothing else. Do not explain, do not translate, do not greet. Just output the tag.
6. Once the system returns the data, you will receive it in the next message. You must then use that data to answer the user's question, without mentioning the tool or the API.
7. NEVER assume, guess, or hallucinate numbers or names.
8. CONFIDENTIALITY AND SECURITY ENFORCEMENT:
   - NEVER mention the tool name 'fetchApplicationData', the endpoint paths, API routes, or that you are calling an API, function, database, or backend.
   - NEVER output any JSON blocks, function signatures, database schema fields, or programming code to the user.
   - Keep all tool execution completely silent from the user. Provide the final answers in natural language.
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
Do not discuss internal data or user-specific information.${contactInfo}

${TOOL_INSTRUCTIONS}`;
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
Do not discuss other meetings or company data.

${TOOL_INSTRUCTIONS}`;
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
                    select: { id: true, fullname: true, email: true, role: true, phone: true, identifiant_extern: true },
                }),
            ]);

            const meetingsSummary = meetings.map(m =>
                `  - [${m.status}] ${m.subject} (${m.type}) — ${m.date} ${m.time} [${m.mode}] ID:${m.id}`
            ).join('\n');

            const usersSummary = users.map(u =>
                `  - ${u.fullname || u.email} (${u.role})${u.phone ? ` | Phone: ${u.phone}` : ''}${u.identifiant_extern ? ` | ExtID: ${u.identifiant_extern}` : ''}`
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

Help them manage their meetings, understand platform features, and use the system effectively.

${TOOL_INSTRUCTIONS}`;
        } catch {
            return `${base}

CONTEXT: Admin user. Help them manage their meetings and use the platform.

${TOOL_INSTRUCTIONS}`;
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
Help them manage the platform, debug issues, and understand system behavior.

${TOOL_INSTRUCTIONS}`;
        } catch {
            return `${base}

CONTEXT: Developer with full platform access.

${TOOL_INSTRUCTIONS}`;
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

// Helper function to extract endpoints from text-based tool calls (XML or raw JSON blocks)
function extractEndpoints(text: string): string[] {
    const endpoints: string[] = [];
    if (!text) return endpoints;

    // 1. Check standard XML-like tags: <function=fetchApplicationData>{"endpoint": "..."}</function>
    const xmlRegex = /<function=fetchApplicationData>([\s\S]*?)<\/function>/g;
    let match;
    while ((match = xmlRegex.exec(text)) !== null) {
        const innerText = match[1].trim();
        try {
            const args = JSON.parse(innerText);
            if (args.endpoint) {
                const ep = args.endpoint.trim();
                if (!endpoints.includes(ep)) endpoints.push(ep);
            }
        } catch {
            const epMatch = innerText.match(/['"]endpoint['"]\s*:\s*['"]([^'"]+)['"]/);
            if (epMatch) {
                const ep = epMatch[1].trim();
                if (!endpoints.includes(ep)) endpoints.push(ep);
            }
        }
    }

    // 2. Check raw JSON blocks with endpoint key
    const jsonRegex = /\{[^{}]*['"]endpoint['"]\s*:\s*['"]([^'"]+)['"][^{}]*\}/g;
    while ((match = jsonRegex.exec(text)) !== null) {
        const ep = match[1].trim();
        if (!endpoints.includes(ep)) {
            endpoints.push(ep);
        }
    }

    return endpoints;
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

        // Tool definition
        const tools = [
            {
                type: 'function',
                function: {
                    name: 'fetchApplicationData',
                    description: 'Fetch data from the AxiaMeetings internal API to answer user questions about users, meetings, companies, participants, etc.',
                    parameters: {
                        type: 'object',
                        properties: {
                            endpoint: {
                                type: 'string',
                                description: 'The API endpoint to call, e.g., /api/meetings/14/participants, /api/users, /api/companies/my'
                            }
                        },
                        required: ['endpoint']
                    }
                }
            }
        ];

        // Execute tool function
        async function executeToolCall(endpoint: string, req: NextRequest) {
            try {
                if (!endpoint.startsWith('/')) endpoint = '/' + endpoint;

                // Normalize agenda endpoint calls to points
                if (endpoint.includes('/agenda')) {
                    endpoint = endpoint.replace('/agenda', '/points');
                }

                // Strip query parameters for regex pathname matching
                const urlParts = endpoint.split('?');
                const pathname = urlParts[0];

                                // 1. Direct DB Query Resolution to bypass Next.js server-side fetch cookie-stripping/auth issues
                const participantsMatch = pathname.match(/^\/?api\/meetings\/(\d+)\/participants\/?$/i) || pathname.match(/^\/?meetings\/(\d+)\/participants\/?$/i);
                if (participantsMatch) {
                    const meetingId = Number(participantsMatch[1]);
                    const meeting = await prisma.meetings.findUnique({
                        where: { id: meetingId },
                        select: { company_id: true }
                    });
                    if (!meeting) return JSON.stringify({ error: 'Meeting not found' });
                    if (role === 'ADMIN' && meeting.company_id !== companyId) {
                        return JSON.stringify({ error: 'Forbidden' });
                    }
                    const participants = await prisma.meetings_participants.findMany({
                        where: { meeting_id: meetingId },
                        orderBy: { id: 'asc' }
                    });
                    return JSON.stringify({ status: true, data: participants });
                }

                const pointsMatch = pathname.match(/^\/?api\/meetings\/(\d+)\/points\/?$/i) || pathname.match(/^\/?meetings\/(\d+)\/points\/?$/i);
                if (pointsMatch) {
                    const meetingId = Number(pointsMatch[1]);
                    const meeting = await prisma.meetings.findUnique({
                        where: { id: meetingId },
                        select: { company_id: true }
                    });
                    if (!meeting) return JSON.stringify({ error: 'Meeting not found' });
                    if (role === 'ADMIN' && meeting.company_id !== companyId) {
                        return JSON.stringify({ error: 'Forbidden' });
                    }
                    const points = await prisma.meetings_points.findMany({
                        where: { meeting_id: meetingId, parent_id: null },
                        include: { meetings_votes: true, meetings_points: true },
                        orderBy: { id: 'asc' }
                    });
                    return JSON.stringify({ status: true, data: points });
                }

                const documentsMatch = pathname.match(/^\/?api\/meetings\/(\d+)\/documents\/?$/i) || pathname.match(/^\/?meetings\/(\d+)\/documents\/?$/i);
                if (documentsMatch) {
                    const meetingId = Number(documentsMatch[1]);
                    const meeting = await prisma.meetings.findUnique({
                        where: { id: meetingId },
                        select: { company_id: true }
                    });
                    if (!meeting) return JSON.stringify({ error: 'Meeting not found' });
                    if (role === 'ADMIN' && meeting.company_id !== companyId) {
                        return JSON.stringify({ error: 'Forbidden' });
                    }
                    const documents = await prisma.meetings_documents.findMany({
                        where: { meeting_id: meetingId },
                        orderBy: { id: 'asc' }
                    });
                    return JSON.stringify({ status: true, data: documents });
                }

                const meetingMatch = pathname.match(/^\/?api\/meetings\/(\d+)\/?$/i) || pathname.match(/^\/?meetings\/(\d+)\/?$/i);
                if (meetingMatch) {
                    const meetingId = Number(meetingMatch[1]);
                    const meeting = await prisma.meetings.findUnique({
                        where: { id: meetingId },
                        include: {
                            meetings_points: {
                                orderBy: { id: 'asc' },
                                include: { meetings_votes: true }
                            },
                            meetings_participants: true,
                            meetings_documents: true
                        }
                    });
                    if (!meeting) return JSON.stringify({ error: 'Meeting not found' });
                    if (role === 'ADMIN' && meeting.company_id !== companyId) {
                        return JSON.stringify({ error: 'Forbidden' });
                    }
                    return JSON.stringify({ status: true, data: meeting });
                }

                if (pathname.match(/^\/?(api\/)?meetings\/?$/i)) {
                    const meetings = await prisma.meetings.findMany({
                        where: role === 'ADMIN' && companyId ? { company_id: companyId } : undefined,
                        orderBy: { created_at: 'desc' }
                    });
                    return JSON.stringify({ status: true, data: meetings });
                }

                const userMatch = pathname.match(/^\/?api\/users\/(\d+)\/?$/i) || pathname.match(/^\/?users\/(\d+)\/?$/i);
                if (userMatch) {
                    const targetUserId = Number(userMatch[1]);
                    const userData = await prisma.users.findUnique({
                        where: { id: targetUserId },
                        select: {
                            id: true,
                            fullname: true,
                            email: true,
                            username: true,
                            role: true,
                            phone: true,
                            identifiant_extern: true,
                            company_id: true,
                            company: { select: { id: true, name: true } }
                        }
                    });
                    if (!userData) return JSON.stringify({ error: 'User not found' });
                    if (role === 'ADMIN' && userData.company_id !== companyId) {
                        return JSON.stringify({ error: 'Forbidden' });
                    }
                    return JSON.stringify({ status: true, data: userData });
                }

                const searchParams = new URLSearchParams(urlParts[1] || '');
                if (pathname.match(/^\/?(api\/)?users\/?$/i)) {
                    let whereClause: any = {};
                    if (role === 'ADMIN' && companyId) {
                        whereClause.company_id = companyId;
                    }
                    const emailParam = searchParams.get('email');
                    if (emailParam) {
                        whereClause.email = emailParam;
                    }
                    const usernameParam = searchParams.get('username');
                    if (usernameParam) {
                        whereClause.username = usernameParam;
                    }
                    const users = await prisma.users.findMany({
                        where: whereClause,
                        select: {
                            id: true,
                            fullname: true,
                            email: true,
                            username: true,
                            role: true,
                            phone: true,
                            identifiant_extern: true,
                            company_id: true,
                            company: { select: { id: true, name: true } }
                        },
                        orderBy: { id: 'asc' }
                    });
                    return JSON.stringify({ status: true, data: users });
                }

                if (pathname.match(/^\/?(api\/)?companies\/my\/?$/i)) {
                    if (role === 'ADMIN' && companyId) {
                        const company = await prisma.companies.findUnique({
                            where: { id: companyId }
                        });
                        return JSON.stringify({ status: true, data: company });
                    }
                }

                // 2. Fallback to HTTP Fetch if the endpoint was not directly handled
                const baseUrl = new URL(req.url).origin;
                const fullUrl = baseUrl + endpoint;
                const cookieHeader = req.headers.get('cookie') || '';
                const response = await fetch(fullUrl, {
                    headers: { 'Cookie': cookieHeader }
                });
                if (!response.ok) {
                    return JSON.stringify({ error: `API returned status ${response.status}` });
                }
                const data = await response.json();
                return JSON.stringify(data).substring(0, 3002);
            } catch (err: any) {
                return JSON.stringify({ error: err.message });
            }
        }

        const groqSession = await getStreamingClient();

        let fullResponse = '';
        const encoder = new TextEncoder();
        let readable: any = null;

        let useFallback = !groqSession;

        if (groqSession) {
            try {
                const { client: groqClient, tokenId: groqTokenId } = groqSession;
                const groqMessages = [
                    { role: 'system', content: systemPrompt },
                    ...messages.slice(-10),
                ];

                if (groqMessages.length > 0) {
                    const lastMsg = groqMessages[groqMessages.length - 1];
                    if (lastMsg.role === 'user') {
                        groqMessages[groqMessages.length - 1] = {
                            ...lastMsg,
                            content: `${lastMsg.content}\n\n(Reminder: If you need to check participants, users, or specific details to answer this, you MUST call the tool fetchApplicationData. Do NOT guess or hallucinate.)`
                        };
                    }
                }

                const response = await groqClient.chat.completions.create({
                    model: 'llama-3.3-70b-versatile',
                    messages: groqMessages,
                    tools: tools as any,
                    tool_choice: 'auto',
                    max_tokens: 1024,
                    temperature: 0.7,
                });

                const choice = response.choices[0];
                const toolCalls = choice?.message?.tool_calls;
                const textContent = choice?.message?.content || '';
                const extractedEndpoints = extractEndpoints(textContent);
                const hasTextToolCall = extractedEndpoints.length > 0;

                if ((toolCalls && toolCalls.length > 0) || hasTextToolCall) {
                    const toolMessages: any[] = [
                        { role: 'system', content: systemPrompt },
                        ...messages.slice(-10),
                    ];

                    if (toolCalls && toolCalls.length > 0) {
                        toolMessages.push(choice.message);
                        for (const toolCall of toolCalls) {
                            if (toolCall.function.name === 'fetchApplicationData') {
                                const args = JSON.parse(toolCall.function.arguments);
                                console.log(`[AI Chat] Executing native tool call fetchApplicationData for endpoint: ${args.endpoint}`);
                                const result = await executeToolCall(args.endpoint, req);
                                toolMessages.push({
                                    role: 'tool',
                                    tool_call_id: toolCall.id,
                                    name: 'fetchApplicationData',
                                    content: result,
                                });
                            }
                        }
                    }

                    if (hasTextToolCall) {
                        toolMessages.push({ role: 'assistant', content: textContent });
                        for (const ep of extractedEndpoints) {
                            try {
                                console.log(`[AI Chat] Executing parsed text tool call fetchApplicationData for endpoint: ${ep}`);
                                const result = await executeToolCall(ep, req);
                                toolMessages.push({
                                    role: 'user',
                                    content: `[System Notification: The tool 'fetchApplicationData' returned the following data for endpoint "${ep}"]: ${result}`
                                });
                            } catch (e) {
                                console.error('Failed to parse or execute text tool call:', e);
                            }
                        }
                    }

                    const stream = await groqClient.chat.completions.create({
                        model: 'llama-3.3-70b-versatile',
                        messages: toolMessages,
                        stream: true,
                        max_tokens: 1024,
                        temperature: 0.7,
                    });

                    readable = new ReadableStream({
                        async start(controller) {
                            try {
                                for await (const chunk of stream) {
                                    let text = chunk.choices[0]?.delta?.content || '';
                                    if (text) {
                                        text = text.replace(/<\/?.+?>/g, '');
                                        if (text) {
                                            fullResponse += text;
                                            controller.enqueue(encoder.encode(text));
                                        }
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
                    const cleanedContent = textContent.replace(/<\/?.+?>/g, '')
                                                     .replace(/\{[^{}]*['"]endpoint['"]\s*:\s*['"]([^'"]+)['"][^{}]*\}/gi, '')
                                                     .replace(/fetchApplicationData/gi, '');
                    fullResponse = cleanedContent;

                    readable = new ReadableStream({
                        async start(controller) {
                            const words = cleanedContent.split(/(\s+)/);
                            for (const word of words) {
                                if (word) {
                                    controller.enqueue(encoder.encode(word));
                                    await new Promise(r => setTimeout(r, 10));
                                }
                            }
                            controller.close();
                            await trackUsage(groqTokenId, 'chat', true).catch(() => { });
                            await saveChatSession();
                        },
                    });
                }
            } catch (groqErr: any) {
                console.warn('[AI Chat] Groq streaming failed, falling back to Gemini/OpenRouter...', groqErr?.message || groqErr);
                await trackUsage(groqSession.tokenId, 'chat', false).catch(() => { });
                useFallback = true;
            }
        }

        if (useFallback) {
            try {
                const basePrompt = `${systemPrompt}\n\n${messages.slice(-10).map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}`;
                const reminder = `\n\n[SYSTEM REMINDER]\n- If the user asks for specific data, lists, or counts (e.g. participants in a meeting, user list) that are not fully detailed in the context, you MUST call the tool by outputting: <function=fetchApplicationData>{"endpoint": "..."}</function>\n- Replace the endpoint with the correct API route (e.g. "/api/meetings/14/participants").\n- Output ONLY the tool call tag and nothing else. Do NOT write any greeting or introductory/concluding text when calling a tool.\n- Do NOT guess, assume, or hallucinate any numbers.\n- CONFIDENTIALITY: NEVER expose API routes, endpoints, function names (like fetchApplicationData), database tables/variables, or raw code to the user. Keep all backend queries completely invisible.`;
                const fullPrompt = `${basePrompt}${reminder}\nAssistant:`;
                fullResponse = await getChatResponse(fullPrompt, { maxOutputTokens: 1024 });

                const fallbackEndpoints = extractEndpoints(fullResponse);
                if (fallbackEndpoints.length > 0) {
                    let toolResults = '';
                    for (const ep of fallbackEndpoints) {
                        try {
                            console.log(`[AI Chat Fallback] Executing parsed text tool call for endpoint: ${ep}`);
                            const result = await executeToolCall(ep, req);
                            toolResults += `\n[Tool Result for ${ep}]: ${result}\n`;
                        } catch (e) {
                            console.error('Fallback text tool parse error:', e);
                        }
                    }

                    const secondPrompt = `${basePrompt}\nAssistant: ${fullResponse}\nSystem: Here are the tool results for your query:\n${toolResults}\nAssistant:`;
                    fullResponse = await getChatResponse(secondPrompt, { maxOutputTokens: 1024 });
                }

                // Clean up any remaining XML tags, JSON blocks, or endpoint paths
                fullResponse = fullResponse.replace(/<\/?.+?>/g, '')
                                           .replace(/\{[^{}]*['"]endpoint['"]\s*:\s*['"]([^'"]+)['"][^{}]*\}/gi, '')
                                           .replace(/fetchApplicationData/gi, '');
            } catch (err: any) {
                return new Response(
                    JSON.stringify({ error: 'No AI provider available. Add API keys in AI Tokens settings.' }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                );
            }
            readable = new ReadableStream({
                async start(controller) {
                    const words = fullResponse.split(/(\s+)/);
                    for (const word of words) {
                        if (word) {
                            controller.enqueue(encoder.encode(word));
                            await new Promise(r => setTimeout(r, 10));
                        }
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
