import { prisma } from './prisma';

export async function createLog({
    message,
    userId = null,
    companyId = null,
    request = null,
    payload = null,
    response = null
}: {
    message: string;
    userId?: number | null;
    companyId?: number | null;
    request?: any;
    payload?: any;
    response?: any;
}) {
    try {
        await prisma.logs.create({
            data: {
                message,
                user_id: userId ?? undefined,
                company_id: companyId || null,
                request: request ? JSON.parse(JSON.stringify(request)) : null,
                payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
                response: response ? JSON.parse(JSON.stringify(response)) : null,
            }
        });
    } catch (error) {
        console.error('Failed to create log:', error);
    }
}
