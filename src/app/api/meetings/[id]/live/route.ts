import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';
import { notifyParticipants } from '@/lib/notifier';
import fs from 'fs';
import path from 'path';

// GET: get live meeting data
/**
 * @description AI Agent Documentation
 * Endpoint: /api/meetings/[id]/live
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/meetings/[id]/live`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `meetings_participants`
 * - Model: `meetings`
 * - Model: `meetings_votes`
 * - Model: `meetings_points`
 * - Model: `meetings_turn_requests`
 * - Model: `users`
 * - Model: `meetings_documents`
 * RELATIONS INCLUDED: 
 * meetings_invitations: { where: { meeting_id: Number(id) | meetings_points: { include: { meetings_votes: true | meetings_participants: true, company: { select: { name: true | company: true, meetings_points: { include: { meetings_votes: { include: { meetings_participant: { select: { email: true | meetings_participant: { select: { email: true

 * AI AGENT DATA ACCESS & ROLE RULES:
 * 1. UNAUTHENTICATED: Only provide general AxiaMeetings info (total companies, users, references, guides).
 * 2. ADMIN: Restrict all answers to data where companyId matches the admin's company. They can query specific meetings, users, etc., within their company.
 * 3. PARTICIPANT (Token): Restrict all answers strictly to the single meeting associated with their token.
 * 4. DEVELOPER: Full access to all data.
 * 
 * INSTRUCTIONS FOR AI:
 * - Read `prisma/schema.prisma` first to understand the exact fields and relations available for the models listed above.
 * - Call this GET endpoint to fetch the JSON data.
 * - Parse the JSON, filter it according to the ROLE RULES above, and return the exact properties the user asked for.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    const user = await getAuthenticatedUser(req);

    if (!user && (!token || !email)) {
        return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    let participantId: number | null = null;
    if (!user && token && email) {
        const participant = await prisma.meetings_participants.findFirst({
            where: { meeting_id: Number(id), token, email },
            include: {
                meetings_invitations: {
                    where: { meeting_id: Number(id) }
                }
            }
        });

        if (!participant) {
            return NextResponse.json({ status: false, message: 'Invalid token or email' }, { status: 401 });
        }

        // Check if invitation was accepted
        const invitation = participant.meetings_invitations[0];
        if (!invitation || invitation.status !== 'ACCEPTED') {
            return NextResponse.json({
                status: false,
                message: 'You must accept the invitation before joining the live room',
                requireAcceptance: true
            }, { status: 403 });
        }

        participantId = participant.id;
    }

    try {
        const meeting = await prisma.meetings.findUnique({
            where: { id: Number(id) },
            include: {
                meetings_points: { include: { meetings_votes: true } },
                meetings_participants: true,
                meetings_turn_requests: { where: { status: 'PENDING' }, orderBy: { created_at: 'asc' } },
                meetings_attendances: true,
                meetings_documents: true,
            },
        });

        if (!meeting) return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });

        // Block access if finished
        if (meeting.status === 'FINISHED' && !user) {
            return NextResponse.json({ status: false, message: 'This meeting has ended.' }, { status: 403 });
        }

        return NextResponse.json({ status: true, data: meeting, participantId });
    } catch (error) {
        console.error('Error fetching live meeting:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// POST: submit a vote
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const { point_id, meetings_participant_id, vote } = await req.json();
        if (!point_id || !meetings_participant_id || !vote) {
            return NextResponse.json({ status: false, message: 'point_id, meetings_participant_id and vote are required' }, { status: 400 });
        }

        const existing = await prisma.meetings_votes.findFirst({
            where: { point_id: Number(point_id), meetings_participant_id: Number(meetings_participant_id) },
        });

        if (existing) {
            await prisma.meetings_votes.update({ where: { id: existing.id }, data: { vote } });
        } else {
            await prisma.meetings_votes.create({
                data: { point_id: Number(point_id), meetings_participant_id: Number(meetings_participant_id), vote },
            });
        }

        const meeting = await prisma.meetings.findUnique({ where: { id: Number(id) } });
        const participant = await prisma.meetings_participants.findUnique({ where: { id: Number(meetings_participant_id) } });
        const point = await prisma.meetings_points.findUnique({ where: { id: Number(point_id) } });

        await createLog({
            message: `Vote recorded: ${participant?.email} voted ${vote} on point "${point?.point}" in meeting "${meeting?.subject}"`,
            companyId: meeting?.company_id,
            payload: { point_id, meetings_participant_id, vote },
            response: { success: true }
        });

        return NextResponse.json({ status: true, message: 'Vote recorded' });
    } catch (error) {
        console.error('Error recording vote:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// PUT: update meeting status or handle turn requests
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'DEVELOPER' && user.role !== 'ADMIN')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    const meetingId = Number(id);

    try {
        const body = await req.json();
        const { action, status, turn_request_id, turn_status } = body;

        if (action === 'update_status' && status) {
            // Only the creator can start the meeting
            if (status === 'STARTED') {
                const existing = await prisma.meetings.findUnique({
                    where: { id: meetingId },
                    select: { creator_id: true, status: true },
                });
                if (!existing) return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });
                if (existing.creator_id !== user.userId && user.role !== 'DEVELOPER') {
                    return NextResponse.json({ status: false, message: 'Only the meeting creator can start the meeting' }, { status: 403 });
                }
                // Don't re-start if already started
                if (existing.status === 'STARTED') {
                    return NextResponse.json({ status: true, message: 'Already started' });
                }
            }

            const meeting = await prisma.meetings.update({
                where: { id: meetingId },
                data: { status, editor_id: user.userId, updated_at: new Date() },
                include: {
                    meetings_participants: true,
                    company: { select: { name: true } },
                },
            });

            let pushMessage = '';
            // When meeting starts, send unified notifications
            let expiredToken = false;
            if (status === 'STARTED' && meeting.meetings_participants.length > 0) {
                const result = await notifyParticipants({
                    companyId: meeting.company_id,
                    meeting,
                    type: 'START',
                    subject: `En direct`,
                    body: `${meeting.subject}`,
                    participants: meeting.meetings_participants
                }).catch(err => {
                    console.error('Start notification failed:', err);
                    return { expired: false, pushMessage: '' };
                });
                if (result?.expired) {
                    expiredToken = true;
                    if (result.pushMessage) pushMessage = result.pushMessage;
                }
            }

            // When meeting finishes, notify
            if (status === 'FINISHED') {
                if (meeting.meetings_participants.length > 0) {
                    const result = await notifyParticipants({
                        companyId: meeting.company_id,
                        meeting,
                        type: 'FINISHED',
                        subject: `Terminée`,
                        body: `${meeting.subject}`,
                        participants: meeting.meetings_participants
                    }).catch(err => {
                        console.error('Finish notification failed:', err);
                        return { expired: false, pushMessage: '' };
                    });
                    if (result?.expired) {
                        expiredToken = true;
                        if (result.pushMessage) pushMessage = result.pushMessage;
                    }
                }
            }

            await createLog({
                message: `Meeting status updated to ${status}: ${meeting.subject}`,
                userId: user.userId,
                companyId: meeting.company_id,
                payload: { action, status },
                response: { success: true }
            });

            return NextResponse.json({ status: true, data: meeting, expiredToken, pushMessage });
        }

        if (action === 'turn_request' && turn_request_id && turn_status) {
            const updated = await prisma.meetings_turn_requests.update({
                where: { id: Number(turn_request_id) },
                data: { status: turn_status },
            });

            await createLog({
                message: `Meeting turn request updated to ${turn_status} in meeting ID ${meetingId}`,
                userId: user.userId,
                companyId: user.companyId || -1, // Use -1 as fallback if companyId is null
                payload: { action, turn_request_id, turn_status },
                response: { success: true }
            });

            return NextResponse.json({ status: true, data: updated });
        }

        return NextResponse.json({ status: false, message: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('Error updating live meeting:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}



// Auto-generate PV as a document when meeting ends
async function autoGeneratePVDocument(meetingId: number) {
    try {
        const meeting = await prisma.meetings.findUnique({
            where: { id: meetingId },
            include: {
                company: true,
                meetings_points: {
                    include: {
                        meetings_votes: {
                            include: { meetings_participant: { select: { email: true } } },
                        },
                    },
                },
                meetings_participants: true,
                meetings_attendances: {
                    include: { meetings_participant: { select: { email: true } } },
                },
            },
        });

        if (!meeting) return;

        const creator = await prisma.users.findUnique({ where: { id: meeting.creator_id } });

        const presents = meeting.meetings_attendances?.filter((a: any) => a.meetings_attendances_status === 'PRESENT') || [];
        const absents = meeting.meetings_participants?.filter((p: any) =>
            !meeting.meetings_attendances?.some((a: any) => a.meetings_participant_id === p.id && a.meetings_attendances_status === 'PRESENT')
        ) || [];

        const calculateEndTime = (start: string, dur: string) => {
            if (!start) return 'N/A';
            const [h, m] = start.split(':').map(Number);
            let mins = 60;
            if (dur === 'HALF_HOUR') mins = 30;
            if (dur === 'TWO_HOURS') mins = 120;
            if (dur === 'THREE_HOURS') mins = 180;
            const tot = h * 60 + m + mins;
            return `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
        };

        const html = `
            <!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; line-height: 1.4; padding: 0; margin: 0; background: #fff; font-size: 14px; }
                    .container { padding: 40px; min-height: 29.7cm; display: flex; flex-direction: column; position: relative; box-sizing: border-box; }
                    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #002b5b; padding-bottom: 15px; margin-bottom: 20px; }
                    .logo { height: 50px; }
                    .title-box h1 { color: #002b5b; margin: 0; font-size: 14px; font-weight: bold; text-transform: uppercase; }
                    .title-box p { color: #94a3b8; margin: 0; font-weight: bold; font-size: 14px; text-transform: uppercase; }
                    .ref { text-align: right; font-size: 14px; color: #94a3b8; font-weight: bold; text-transform: uppercase; }
                    .date-text { color: #0f172a; font-size: 14px; font-weight: bold; text-transform: uppercase; margin: 0; }
                    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; font-size: 14px; }
                    th, td { border: 1px solid #e2e8f0; padding: 5px; text-align: left; }
                    th { background-color: #f8fafc; font-weight: bold; }
                    .section-title { color: #002b5b; font-size: 14px; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px; margin-bottom: 10px; margin-top: 0; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
                    .info-item { display: flex; gap: 10px; }
                    .info-label { font-weight: bold; color: #64748b; text-transform: uppercase; width: 100px; letter-spacing: 0.02em; }
                    .info-value { font-weight: bold; color: #0f172a; }
                    .desc-text { color: #334155; text-align: justify; margin-bottom: 20px; }
                    .stats-signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: auto; border-top: 2px solid #002b5b; padding-top: 15px; }
                    .signature-box { border: 1px dashed #cbd5e1; height: 80px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-style: italic; margin-top: 10px; }
                    .footer { position: absolute; bottom: 20px; left: 40px; right: 40px; border-top: 1px solid #e2e8f0; padding-top: 10px; display: flex; justify-content: space-between; font-size: 14px; color: #64748b; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            ${meeting.company?.logo_url ? `<img src="${meeting.company.logo_url}" class="logo">` : `<div style="width: 50px; height: 50px; background: #002b5b; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; border-radius: 8px;">S</div>`}
                            <div class="title-box">
                                <h1>Procès-Verbal</h1>
                                <p>${meeting.type === 'ORDINAIRE' ? 'Assemblée Générale Ordinaire' : 'Assemblée Générale Extraordinaire'}</p>
                            </div>
                        </div>
                        <div class="ref">
                            <p class="date-text">${new Date(meeting.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                            Réf: PV-${meeting.id}/${new Date(meeting.date).getFullYear()}
                        </div>
                    </div>

                    <div class="section-title">1. Informations Générales</div>
                    <div class="info-grid">
                        <div class="info-item"><span class="info-label">Objet:</span><span class="info-value">${meeting.subject}</span></div>
                        <div class="info-item"><span class="info-label">Présidée par:</span><span class="info-value">${creator?.email?.split('@')[0] || 'Direction Générale'}</span></div>
                        <div class="info-item"><span class="info-label">Mode:</span><span class="info-value">${meeting.mode?.replace(/_/g, ' ') || 'N/A'}</span></div>
                        <div class="info-item"><span class="info-label">Date:</span><span class="info-value">${new Date(meeting.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
                        <div class="info-item"><span class="info-label">Heure:</span><span class="info-value">${meeting.time}</span></div>
                        <div class="info-item"><span class="info-label">Durée:</span><span class="info-value">${meeting.duration?.replace(/_/g, ' ').toLowerCase() || 'N/A'}</span></div>
                        <div class="info-item"><span class="info-label">Lieu:</span><span class="info-value">${meeting.location || 'Tunisie'}</span></div>
                        <div class="info-item"><span class="info-label">Plateforme:</span><span class="info-value">${meeting.mode === 'ONLINE' || meeting.isonline === 'TRUE' ? 'En Ligne' : 'Présentiel'}</span></div>
                    </div>

                    <div class="section-title">2. Ordre du jour & Objectifs</div>
                    <p class="desc-text">${meeting.description || "Présenter les résultats de l'exercice, discuter des points stratégiques, adopter les résolutions nécessaires et définir les actions à venir."}</p>

                    <div class="section-title">3. Points à l'ordre du jour & Résolutions</div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 30px;">#</th>
                                <th>Point / Résolution</th>
                                <th style="width: 60px; text-align: center;">Type</th>
                                <th style="width: 50px; text-align: center; color: #15803d;">Pour</th>
                                <th style="width: 50px; text-align: center; color: #b91c1c;">Contre</th>
                                <th style="width: 50px; text-align: center; color: #475569;">Abs</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${meeting.meetings_points?.map((p: any, idx: number) => {
            const v = p.meetings_votes || [];
            return `<tr>
                                    <td style="text-align: center; font-weight: bold;">${String(idx + 1).padStart(2, '0')}</td>
                                    <td style="font-weight: bold;">${p.point}</td>
                                    <td style="text-align: center; font-weight: bold;">${p.type === 'VOTE' ? 'VOTE' : 'INFO'}</td>
                                    <td style="text-align: center; font-weight: bold; color: #15803d;">${p.type === 'VOTE' ? v.filter((x: any) => x.vote === 'OUI').length : '-'}</td>
                                    <td style="text-align: center; font-weight: bold; color: #b91c1c;">${p.type === 'VOTE' ? v.filter((x: any) => x.vote === 'NON').length : '-'}</td>
                                    <td style="text-align: center; font-weight: bold; color: #475569;">${p.type === 'VOTE' ? v.filter((x: any) => x.vote === 'NEUTRE').length : '-'}</td>
                                </tr>`;
        }).join('')}
                        </tbody>
                    </table>

                    <div class="stats-signature-grid">
                        <div>
                            <div class="section-title" style="border:none; margin-bottom: 5px;">Statistiques de Présence</div>
                            <div class="info-item" style="margin-bottom: 5px;"><span class="info-label">Total Invités:</span><span class="info-value">${meeting.meetings_participants?.length || 0}</span></div>
                            <div class="info-item" style="margin-bottom: 5px;"><span class="info-label">Présents:</span><span class="info-value" style="color: #15803d;">${presents.length}</span></div>
                            <div class="info-item" style="margin-bottom: 5px;"><span class="info-label">Absents:</span><span class="info-value" style="color: #b91c1c;">${absents.length}</span></div>
                        </div>
                        <div style="text-align: center;">
                            <div class="section-title" style="border:none; margin-bottom: 0;">Signature & Cachet</div>
                            <div class="signature-box">Cachet de l'entreprise</div>
                            <div style="font-weight: bold; text-transform: uppercase; margin-top: 5px;">${creator?.email?.split('@')[0] || 'Directeur Général'}</div>
                        </div>
                    </div>

                </div>
                <div class="footer">
                    <span>Axia Meetings - ${meeting.company?.name || 'Syndic'}</span>
                    <span>Document généré le ${new Date().toLocaleDateString('fr-FR')}</span>
                </div>
            </body>
            </html>
        `;

        const fileName = `pv-${meeting.id}-${Date.now()}.html`;
        const dirPath = path.join(process.cwd(), 'public', 'uploads', 'pvs');
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        const filePath = path.join(dirPath, fileName);
        fs.writeFileSync(filePath, html);

        // Add to meetings_documents
        await prisma.meetings_documents.create({
            data: {
                meeting_id: meetingId,
                file_title: `Procès-Verbal - ${meeting.subject}`,
                file_path: `/uploads/pvs/${fileName}`,
            }
        });

    } catch (error) {
        console.error('Error generating PV document:', error);
    }
}
