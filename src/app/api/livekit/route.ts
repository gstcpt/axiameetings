import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const room = searchParams.get('room');
    const username = searchParams.get('username');

    if (!room || !username) {
        return NextResponse.json({ status: false, message: 'room and username are required' }, { status: 400 });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    // If LiveKit is not configured, return a mock token indicator
    if (!apiKey || !apiSecret) {
        return NextResponse.json({
            status: false,
            message: 'LiveKit is not configured. Add LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and NEXT_PUBLIC_LIVEKIT_URL to your .env file.',
            configured: false,
        }, { status: 503 });
    }

    try {
        const at = new AccessToken(apiKey, apiSecret, {
            identity: username,
            ttl: '4h',
        });

        at.addGrant({
            roomJoin: true,
            room,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        });

        const token = await at.toJwt();
        return NextResponse.json({ status: true, token });
    } catch (error) {
        console.error('LiveKit token error:', error);
        return NextResponse.json({ status: false, message: 'Failed to generate token' }, { status: 500 });
    }
}
