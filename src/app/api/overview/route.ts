import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/overview
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/overview`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `companies`
 * - Model: `meetings`
 * - Model: `users`
 * - Model: `companies_apis`
 * - Model: `logs`
 * RELATIONS INCLUDED: 
 * _count: { select: { users: true

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
export async function GET(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user) {
        return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    try {
        let companies = 0, meetings = 0, users = 0, apis = 0, admins = 0, logs = 0;
        let whereClause: any = {};

        if (user.role === 'DEVELOPER') {
            [companies, meetings, users, apis, admins, logs] = await Promise.all([
                prisma.companies.count(),
                prisma.meetings.count(),
                prisma.users.count(),
                prisma.companies_apis.count(),
                prisma.users.count({ where: { role: 'ADMIN' } }),
                prisma.logs.count(),
            ]);
        } else {
            if (!user.companyId) {
                return NextResponse.json({ status: false, message: 'No company assigned' }, { status: 400 });
            }
            whereClause = { company_id: user.companyId };
            [meetings, users, apis, admins, logs] = await Promise.all([
                prisma.meetings.count({ where: whereClause }),
                prisma.users.count({ where: whereClause }),
                prisma.companies_apis.count({ where: whereClause }),
                prisma.users.count({ where: { ...whereClause, role: 'ADMIN' } }),
                prisma.logs.count({ where: whereClause }),
            ]);
            companies = 1;
        }

        const meetingsData = await prisma.meetings.findMany({
            where: whereClause,
            select: { status: true, type: true, date: true, mode: true }
        });

        const meetingsByStatus: Record<string, number> = { SCHEDULED: 0, STARTED: 0, FINISHED: 0, CANCELLED: 0 };
        const meetingsByType: Record<string, number> = { ORDINAIRE: 0, EXTRAORDINAIRE: 0, COMPLEMENTAIRE: 0, DELEGUES: 0 };

        meetingsData.forEach((m: any) => {
            if (meetingsByStatus[m.status] !== undefined) meetingsByStatus[m.status]++;
            if (meetingsByType[m.type] !== undefined) meetingsByType[m.type]++;
        });

        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const currentDate = new Date();
        const trendDataObj: any[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
            trendDataObj.push({
                name: months[d.getMonth()],
                year: d.getFullYear(),
                month: d.getMonth(),
                meetings: 0
            });
        }

        meetingsData.forEach((m: any) => {
            if (m.date) {
                const [year, month] = m.date.split('-');
                const y = parseInt(year);
                const mon = parseInt(month) - 1;
                const trendItem = trendDataObj.find(t => t.year === y && t.month === mon);
                if (trendItem) {
                    trendItem.meetings++;
                }
            }
        });

        const trendData = trendDataObj.map(t => ({ name: t.name, meetings: t.meetings }));

        // Fetch rich data for new charts
        const [usersData, apiData, logsData] = await Promise.all([
            prisma.users.findMany({
                where: whereClause,
                select: { role: true }
            }),
            prisma.companies_apis.findMany({
                where: user.role !== 'DEVELOPER' ? { company_id: user.companyId! } : {},
                select: { method: true }
            }),
            prisma.logs.findMany({
                where: {
                    ...whereClause,
                    timestamp: { gte: new Date(new Date().setDate(new Date().getDate() - 6)) } // last 7 days
                },
                select: { timestamp: true }
            })
        ]);

        // Group Users by Role
        const usersByRole: Record<string, number> = { ADMIN: 0, PARTICIPANT: 0, DEVELOPER: 0 };
        usersData.forEach(u => {
            const role = u.role || 'PARTICIPANT';
            if (usersByRole[role] !== undefined) usersByRole[role]++;
        });

        // Group APIs by Method
        const apisByMethod: Record<string, number> = { GET: 0, POST: 0, PUT: 0, DELETE: 0, PATCH: 0 };
        apiData.forEach(a => {
            const method = a.method?.toUpperCase() || 'GET';
            if (apisByMethod[method] !== undefined) apisByMethod[method]++;
            else apisByMethod[method] = 1;
        });

        // Group Logs by Day (Last 7 Days)
        const logsActivityMap = new Map();
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            logsActivityMap.set(dateStr, { name: dateStr, activity: 0 });
        }
        logsData.forEach(l => {
            const dateStr = new Date(l.timestamp).toISOString().split('T')[0];
            if (logsActivityMap.has(dateStr)) {
                logsActivityMap.get(dateStr).activity++;
            }
        });
        const logsActivity = Array.from(logsActivityMap.values());

        // For Developers: Top Companies by Users
        let topCompanies: any[] = [];
        if (user.role === 'DEVELOPER') {
            const companiesWithUsers = await prisma.companies.findMany({
                include: { _count: { select: { users: true } } },
                orderBy: { users: { _count: 'desc' } },
                take: 5
            });
            topCompanies = companiesWithUsers.map(c => ({
                name: c.name,
                users: c._count.users
            }));
        }

        const meetingDates = meetingsData.map((m: any) => m.date).filter(Boolean);

        return NextResponse.json({ 
            status: true, 
            data: { 
                companies, meetings, users, apis, admins, logs,
                meetingsByStatus, meetingsByType, trendData,
                usersByRole, apisByMethod, logsActivity, topCompanies,
                meetingDates
            } 
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
