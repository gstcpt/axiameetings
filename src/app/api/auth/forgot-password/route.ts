import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getMailTransporter, getEmailTemplate } from '@/lib/mail';
import crypto from 'crypto';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
    const ip = getIp(req);
    if (!await rateLimit(ip, 5, 60000)) {
        return NextResponse.json({ status: false, message: 'Too many reset requests. Please try again later.' }, { status: 429 });
    }
    try {
        const { email } = await req.json();
        if (!email) {
            return NextResponse.json({ status: false, message: 'Email is required' }, { status: 400 });
        }

        const user = await prisma.users.findFirst({ where: { email } });

        // Always respond the same way to prevent user enumeration
        if (!user) {
            return NextResponse.json({ status: true, message: 'If an account exists, a reset email has been sent.' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await prisma.users.update({
            where: { id: user.id },
            data: { reset_token: token, reset_token_expiry: expiry },
        });

        let baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
        if (!baseUrl) {
            const protocol = req.headers.get('x-forwarded-proto') || 'http';
            const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
            if (host) {
                baseUrl = `${protocol}://${host}`;
            }
        }
        if (!baseUrl) return NextResponse.json({ status: false, message: 'Error find domain url.' });
        const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;

        const mail = await getMailTransporter();
        if (mail) {
            const { transporter, settings } = mail;
            const companyName = settings.from_name || 'Axia Meetings';

            const content = `
                <p style="font-size:16px; color:#334155; margin:0 0 16px;">Bonjour <strong>${user.fullname || user.email}</strong>,</p>
                <p style="font-size:15px; color:#64748b; margin:0 0 24px; line-height:1.6;">
                    Nous avons reçu une demande de réinitialisation du mot de passe pour votre compte <strong>${companyName}</strong>.
                    Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe. Ce lien expire dans <strong>1 heure</strong>.
                </p>
                <div style="text-align:center; margin: 32px 0;">
                    <a href="${resetUrl}"
                       style="display:inline-block; background:linear-gradient(135deg,#002B5B 0%,#004c8c 100%); color:#fff;
                              text-decoration:none; font-weight:700; font-size:15px; padding:16px 36px;
                              border-radius:12px; letter-spacing:0.3px;">
                        Réinitialiser mon mot de passe
                    </a>
                </div>
                <p style="font-size:13px; color:#94a3b8; margin:24px 0 0; line-height:1.6;">
                    Si vous n'avez pas demandé cette réinitialisation, ignorez simplement cet email — votre mot de passe ne sera pas modifié.
                </p>
                <p style="font-size:12px; color:#cbd5e1; margin:12px 0 0;">
                    Ou copiez ce lien dans votre navigateur :<br/>
                    <span style="color:#002B5B; word-break:break-all;">${resetUrl}</span>
                </p>
            `;

            const html = getEmailTemplate(content, 'Réinitialisation du mot de passe', companyName);

            await transporter.sendMail({
                from: `"${settings.from_name}" <${settings.from_email || settings.email}>`,
                to: user.email!,
                subject: `${companyName} — Réinitialisation du mot de passe`,
                html,
            });
        }

        return NextResponse.json({ status: true, message: 'If an account exists, a reset email has been sent.' });
    } catch (error) {
        console.error('Forgot password error:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}