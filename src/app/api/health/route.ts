import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ status: 'ok', message: 'Axia Backend is reachable!' });
}
