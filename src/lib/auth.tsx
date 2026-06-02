import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) {
    throw new Error("CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not defined!");
}

export interface AxiaJwtPayload {
    userId: number;
    email: string;
    role: string;
    companyId: number | null;
    iat?: number;
    exp?: number;
}

export function signJwt(payload: object) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

export function verifyJwt(token: string): AxiaJwtPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as unknown as AxiaJwtPayload;
    } catch {
        return null;
    }
}

export async function getAuthenticatedUser(req: NextRequest): Promise<AxiaJwtPayload | null> {
    const token = req.cookies.get('axia_meetings_token')?.value || req.headers.get('Authorization')?.split(' ')[1];
    if (!token) return null;
    return verifyJwt(token);
}
