import { executeExternalApiAction } from '../externalApiEngine';
import { getMailTransporter, getEmailTemplate } from '../mail';
import { prisma } from '../prisma';

export async function sendPushMail(companyId: number, title: string, content: string, participantExternalIds: number[], participantsEmails: string[], joinUrlMap: Record<string, string>, meetingId: number) {
    // Check if company prefers internal SMTP
    const company = await prisma.companies.findUnique({
        where: { id: companyId },
        select: { mail_is_active: true, name: true }
    });

    if (company?.mail_is_active) {
        // Fallback to internal SMTP
        const mailer = await getMailTransporter();
        if (mailer) {
            const { transporter, settings } = mailer;
            
            for (const email of participantsEmails) {
                const joinUrl = joinUrlMap[email] || '#';
                const html = getEmailTemplate(`
                    <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px;">
                        ${content}
                    </p>
                    <div style="text-align:center;margin:24px 0;">
                        <a href="${joinUrl}" style="display:inline-block;background:#002B5B;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;">
                            Join Meeting / Accéder à la réunion
                        </a>
                    </div>
                `, title, company.name || 'Axia Meetings');

                transporter.sendMail({
                    from: `"${settings.from_name}" <${settings.from_email}>`,
                    to: email,
                    subject: `📩 ${title}`,
                    html: html,
                }).catch(err => console.error(`[PushMail] Internal SMTP send failed for ${email}:`, err));
            }
        }
        return { success: true, message: 'Dispatched via internal SMTP' };
    }

    // External API
    const promises = participantExternalIds.map((id, index) => {
        const email = participantsEmails[index];
        return executeExternalApiAction({
            companyId,
            actionType: 'push_mails',
            payload: {
                title,
                body: content,
                identifiant_extern: id,
                emails: email, // Send singular email
                join_urls: joinUrlMap[email] || '', // Send singular join URL
                meeting: meetingId
            }
        });
    });
    return Promise.allSettled(promises);
}
