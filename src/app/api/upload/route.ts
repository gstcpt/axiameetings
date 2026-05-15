import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ status: false, message: 'No file uploaded' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Create upload directory if it doesn't exist
        const uploadDir = join(process.cwd(), 'public', 'uploads', 'meetings');
        if (!existsSync(uploadDir)) {
            await mkdir(uploadDir, { recursive: true });
        }

        // Generate unique filename
        const filename = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
        const path = join(uploadDir, filename);

        await writeFile(path, buffer);

        const fileUrl = `/uploads/meetings/${filename}`;

        return NextResponse.json({ 
            status: true, 
            data: { 
                file_path: fileUrl,
                file_title: file.name
            } 
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ status: false, message: 'Upload failed' }, { status: 500 });
    }
}
