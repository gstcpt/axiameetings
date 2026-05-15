import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { generateWithRetry, geminiErrorMessage } from '@/lib/ai-provider';
import { checkAiAccess } from '@/lib/ai-guard';
import fs from 'fs';
import path from 'path';
import { put, del } from '@vercel/blob';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'ADMIN' && user.role !== 'DEVELOPER')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }

    const aiDenied = await checkAiAccess(user);
    if (aiDenied) return aiDenied;

    const { id } = await params;
    const meetingId = parseInt(id);

    try {
        const meeting = await prisma.meetings.findUnique({
            where: { id: meetingId },
            include: {
                meetings_points: { include: { meetings_votes: true } },
                meetings_participants: true,
                meetings_attendances: true,
                company: true,
            },
        });

        if (!meeting) {
            return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });
        }

        const pointsSummary = meeting.meetings_points.map((p, i) => {
            const votes = p.meetings_votes;
            const oui = votes.filter(v => v.vote === 'OUI').length;
            const non = votes.filter(v => v.vote === 'NON').length;
            const neutre = votes.filter(v => v.vote === 'NEUTRE').length;
            const total = votes.length;
            const pct = (n: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : '0%';
            const voteStr = p.type === 'VOTE' && total > 0
                ? `\n   Résultat du vote: Pour ${oui} (${pct(oui)}), Contre ${non} (${pct(non)}), Abstention ${neutre} (${pct(neutre)}) — ${oui > non ? 'ADOPTÉ' : oui < non ? 'REJETÉ' : 'NON CONCLUANT'}`
                : '';
            return `${i + 1}. ${p.type === 'VOTE' ? '📌 [À VOTER]' : '📋 [INFORMATION]'} ${p.point}${p.description ? `\n   Détail: ${p.description}` : ''}${voteStr}`;
        }).join('\n\n');

        const totalParticipants = meeting.meetings_participants.length;
        const attendances = meeting.meetings_attendances;
        const present = attendances.filter(a => a.meetings_attendances_status === 'PRESENT').length;
        const absent = attendances.filter(a => a.meetings_attendances_status === 'ABSENT').length;
        const dateFormatted = new Date(meeting.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        const prompt = `Tu es un juriste expert en droit des copropriétés et syndics d'immeuble. 
Rédige un Procès-Verbal (PV) officiel et complet en français légal pour cette réunion.

INFORMATIONS DE LA RÉUNION:
- Société/Syndic: ${meeting.company?.name || 'Non spécifié'}
- Type de séance: ${meeting.type}
- Sujet: ${meeting.subject}
- Date: ${dateFormatted}
- Heure de début: ${meeting.time}
- Durée: ${meeting.duration?.replace(/_/g, ' ')}
- Mode: ${meeting.mode === 'IN_PERSON' ? 'Présentiel' : meeting.mode === 'ONLINE' ? 'En ligne' : 'Hybride'}
- Lieu: ${meeting.location || 'Non spécifié'}
- Description/Objectifs: ${meeting.description || 'Non spécifiée'}

PRÉSENCE:
- ${totalParticipants} membres convoqués
- ${present} présents, ${absent} absents

ORDRE DU JOUR TRAITÉ:
${pointsSummary || 'Aucun point défini'}

Rédige un PV complet en HTML avec:
1. En-tête officiel avec toutes les informations de la réunion
2. Constatation du quorum et ouverture de séance
3. Pour chaque point: discussion résumée et résolution formelle
4. Pour les votes: résultat exact avec pourcentages et décision (ADOPTÉ/REJETÉ)
5. Clôture de séance
6. Pied de page avec espace pour signatures

Style CSS inline: fond blanc, typographie professionnelle, mise en page formelle.
Commence directement par le HTML (<!DOCTYPE html>), sans explication.`;

        const htmlContent = await generateWithRetry(prompt, { maxOutputTokens: 4096, feature: 'ai-pv' });

        // Save to uploads/pvs directory
        const pvsDir = path.join(process.cwd(), 'public', 'uploads', 'pvs');
        if (!fs.existsSync(pvsDir)) fs.mkdirSync(pvsDir, { recursive: true });

        // Make sure to import { put } from '@vercel/blob'; at the top of your file
        const fileName = `ai-pv-${meetingId}-${Date.now()}.html`;
        let fileUrl = '';

        if (process.env.NODE_ENV === 'production') {
            // VERCEL BLOB LOGIC
            const blob = await put(`pvs/${fileName}`, htmlContent, {
                access: 'public',
                contentType: 'text/html',
            });
            fileUrl = blob.url;
        } else {
            // LOCALHOST LOGIC
            const pvsDir = path.join(process.cwd(), 'public', 'uploads', 'pvs');
            if (!fs.existsSync(pvsDir)) fs.mkdirSync(pvsDir, { recursive: true });
            const filePath = path.join(pvsDir, fileName);
            fs.writeFileSync(filePath, htmlContent, 'utf8');
            fileUrl = `/uploads/pvs/${fileName}`;
        }

        await prisma.meetings_documents.create({
            data: {
                meeting_id: meetingId,
                file_title: `PV IA — ${meeting.subject} (${dateFormatted})`,
                file_path: fileUrl,
            },
        });

        return NextResponse.json({ status: true, data: { url: fileUrl, html: htmlContent } });
    } catch (error: any) {
        console.error('AI PV error:', error?.message || error);
        return NextResponse.json({ status: false, message: geminiErrorMessage(error) }, { status: 500 });
    }
}
