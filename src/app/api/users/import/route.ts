import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { refreshExternToken } from '@/lib/refreshExternToken';
import { formatWebsiteUrl } from '@/lib/utils';

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'ADMIN' && user.role !== 'DEVELOPER')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }

    const urlObj = new URL(req.url);
    const queryCompanyId = urlObj.searchParams.get('companyId');
    const targetCompanyId = user.role === 'DEVELOPER' && queryCompanyId ? parseInt(queryCompanyId) : user.companyId;

    if (!targetCompanyId) {
        return NextResponse.json({ status: false, message: 'No company specified' }, { status: 400 });
    }

    let targetUserId = user.userId;
    if (user.role === 'DEVELOPER') {
        const queryAdminId = urlObj.searchParams.get('adminId');
        if (!queryAdminId) return NextResponse.json({ status: false, message: 'Admin ID required for developers' }, { status: 400 });
        targetUserId = parseInt(queryAdminId);
    }

    try {
        // Get the admin's linked token
        const adminLink = await prisma.companies_admins_login.findFirst({
            where: { user_id: targetUserId, company_id: targetCompanyId },
        });

        if (!adminLink?.token_id) {
            return NextResponse.json({
                status: false,
                message: 'Please link your application first via Companies → Link Application.',
            }, { status: 400 });
        }

        // Get the company with its configured users endpoint
        const company = await prisma.companies.findUnique({
            where: { id: targetCompanyId },
            include: {
                users_endpoint: { include: { formated_responses: true } },
                _count: { select: { users: true } }
            },
        });

        if (!company) {
            return NextResponse.json({ status: false, message: 'Company not found' }, { status: 404 });
        }

        if (!company.users_endpoint) {
            return NextResponse.json({
                status: false,
                message: 'No users endpoint configured. Ask your developer to set it up in Companies → Configure Services.',
            }, { status: 400 });
        }

        const usersEndpoint = company.users_endpoint;
        const formattedCompanyUrl = formatWebsiteUrl(company.url);
        const externalUrl = usersEndpoint.endpoint.startsWith('http')
            ? usersEndpoint.endpoint
            : `${formattedCompanyUrl.replace(/\/$/, '')}/${usersEndpoint.endpoint.replace(/^\//, '')}`;

        let currentToken = adminLink?.token_id;
        let externalRes;
        let externalData;

        // Implementation of the retry logic for token expiration
        for (let attempt = 1; attempt <= 2; attempt++) {
            externalRes = await fetch(externalUrl, {
                method: usersEndpoint.method || 'GET',
                headers: {
                    ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
                    'Content-Type': 'application/json',
                },
            });

            const text = await externalRes.text();
            
            if (!externalRes.ok) {
                // If it's a token expiration error and it's the first attempt, try to refresh
                if (attempt === 1 && (externalRes.status === 401 || text.includes('Expired') || text.includes('expiré') || text.toLowerCase().includes('token'))) {
                    console.log(`[Import] Token expired for company ${targetCompanyId}. Attempting refresh...`);
                    const newToken = await refreshExternToken(targetCompanyId);
                    if (newToken) {
                        currentToken = newToken;
                        continue; // Retry the fetch with the new token
                    }
                }
                
                // If refresh failed or it's not a token error, return the error
                return NextResponse.json({
                    status: false,
                    message: `External API returned ${externalRes.status}. ${text.includes('Expired') ? 'Your token may have expired.' : ''} Check your service configuration.`,
                }, { status: 502 });
            }

            try {
                externalData = JSON.parse(text);
                
                // Some APIs return 200 OK but with an error message inside the JSON
                if (externalData.success === false || externalData.error || externalData.status === false || externalData.status === 'error') {
                    const errorMsg = externalData.message || '';
                    if (attempt === 1 && (errorMsg.includes('expiré') || errorMsg.includes('Expired') || errorMsg.toLowerCase().includes('token'))) {
                         const newToken = await refreshExternToken(targetCompanyId);
                         if (newToken) {
                             currentToken = newToken;
                             continue;
                         }
                    }
                }
                
                break; // Success or unrecoverable error
            } catch (e) {
                return NextResponse.json({ status: false, message: 'External API returned invalid JSON' }, { status: 502 });
            }
        }
        // Support common response shapes
        const rawUsers: any[] = Array.isArray(externalData)
            ? externalData
            : externalData.data || externalData.users || externalData.results || externalData.items || [];

        if (rawUsers.length === 0) {
            return NextResponse.json({
                status: true,
                data: { imported: 0 },
                message: 'No users found in external API response. Check the endpoint or format mappings.',
            });
        }

        // Build field mapping: their field name → our field name
        const fieldMap: Record<string, string> = {};
        for (const m of usersEndpoint.formated_responses) {
            fieldMap[m.response_key] = m.formated_response_key;
        }

        const mapUser = (raw: any): Record<string, any> => {
            const mapped: Record<string, any> = {};
            for (const [theirKey, ourKey] of Object.entries(fieldMap)) {
                if (raw[theirKey] !== undefined) mapped[ourKey] = raw[theirKey];
            }
            // Merge: mapped fields override raw fields
            return { ...raw, ...mapped };
        };

        let imported = 0;
        let currentCount = company._count.users;
        const limit = company.users_number_limit ?? 10;

        for (const rawUser of rawUsers) {
            const u = mapUser(rawUser);

            const email: string | null = u.email || u.mail || null;
            const username: string | null = u.username || u.login || u.user_name || (email ? email.split('@')[0] : null);
            if (!username) continue;

            const phone: string | null = u.phone || u.telephone || u.phone_number || u.mobile || null;
            
            let identifiant_extern: number | null = null;
            if (u.identifiant_extern !== undefined && u.identifiant_extern !== null) {
                identifiant_extern = Number(u.identifiant_extern);
            } else if (u.id !== undefined && u.id !== null) {
                identifiant_extern = Number(u.id);
            }

            // Skip if already exists in this company
            const exists = await prisma.users.findFirst({
                where: {
                    company_id: targetCompanyId,
                    OR: [
                        { username },
                        ...(email ? [{ email }] : []),
                        ...(identifiant_extern ? [{ identifiant_extern }] : []),
                    ],
                },
            });

            if (exists) {
                // Optionally update the existing user's phone/external ID if they were missing
                await prisma.users.update({
                    where: { id: exists.id },
                    data: {
                        ...(phone && !exists.phone ? { phone } : {}),
                        ...(identifiant_extern && !exists.identifiant_extern ? { identifiant_extern } : {}),
                    }
                });
                continue;
            }

            // Check limit before creating a new user
            if (currentCount >= limit) continue;

            const tempPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
            await prisma.users.create({
                data: {
                    fullname: u.fullname || u.full_name || u.name || u.display_name || null,
                    email,
                    username,
                    password: tempPassword,
                    phone,
                    identifiant_extern: isNaN(identifiant_extern as number) ? null : identifiant_extern,
                    role: 'PARTICIPANT',
                    company_id: targetCompanyId,
                },
            });
            imported++;
            currentCount++;
        }

        return NextResponse.json({
            status: true,
            data: { imported },
            message: `${imported} users imported successfully`,
        });
    } catch (error) {
        console.error('Error importing users:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
