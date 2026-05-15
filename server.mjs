import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Attach io to global so it can be used in API routes
  global.io = io;

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join-room', (roomId) => {
      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room ${roomId}`);
    });

    socket.on('join-user', (email) => {
      if (email) {
        socket.join(`user-${email}`);
        console.log(`Socket ${socket.id} joined personal room: user-${email}`);
      }
    });

    // Join Request Logic
    socket.on('join:request', ({ roomId, participantId, name }) => {
      io.to(roomId).emit('join:requested', { participantId, name, socketId: socket.id });
    });

    socket.on('join:accept', ({ roomId, participantId, socketId }) => {
      io.to(socketId).emit('join:accepted');
      io.to(roomId).emit('join:approved', { participantId });
    });

    socket.on('join:reject', ({ socketId }) => {
      io.to(socketId).emit('join:rejected');
    });

    socket.on('meeting:start', ({ roomId }) => {
      io.to(roomId).emit('meeting:started');
    });

    // Voting Logic
    socket.on('vote:start', async ({ roomId, noteId, duration = 60, description }) => {
      io.to(roomId).emit('vote:started', { noteId, duration, description });
      
      // Auto-close vote after duration
      setTimeout(() => {
        io.to(roomId).emit('vote:ended', { noteId });
      }, duration * 1000);
    });

    socket.on('vote:submit', async ({ roomId, noteId, participantId, vote }) => {
      try {
        const voteValue = vote === 'Oui' ? 'OUI' : vote === 'Non' ? 'NON' : 'NEUTRE';
        
        // Corrected logic for meetings_votes
        const existingVote = await prisma.meetings_votes.findFirst({
          where: {
            point_id: Number(noteId),
            meetings_participant_id: Number(participantId)
          }
        });

        if (existingVote) {
          await prisma.meetings_votes.update({
            where: { id: existingVote.id },
            data: { vote: voteValue }
          });
        } else {
          await prisma.meetings_votes.create({
            data: {
              point_id: Number(noteId),
              meetings_participant_id: Number(participantId),
              vote: voteValue
            }
          });
        }

        io.to(roomId).emit('vote:update', { noteId, participantId, vote });
      } catch (error) {
        console.error('Error saving vote:', error);
      }
    });

    // Hand Raising Logic
    socket.on('hand:raise', async ({ roomId, participantId, name }) => {
      try {
        const meetingId = Number(roomId.split('-')[1]);
        await prisma.meetings_turn_requests.create({
          data: {
            meeting_id: meetingId,
            meetings_participant_id: Number(participantId),
            status: 'PENDING'
          }
        });
        io.to(roomId).emit('hand:raised', { participantId, name });
      } catch (error) {
        console.error('Error saving turn request:', error);
      }
    });

    socket.on('hand:accept', async ({ roomId, participantId }) => {
      try {
        const meetingId = Number(roomId.split('-')[1]);
        await prisma.meetings_turn_requests.updateMany({
          where: {
            meeting_id: meetingId,
            meetings_participant_id: Number(participantId),
            status: 'PENDING'
          },
          data: { status: 'ACCEPTED' }
        });
        io.to(roomId).emit('hand:accepted', { participantId });
      } catch (error) {
        console.error('Error accepting hand:', error);
      }
    });

    socket.on('hand:refuse', async ({ roomId, participantId }) => {
      try {
        const meetingId = Number(roomId.split('-')[1]);
        await prisma.meetings_turn_requests.updateMany({
          where: {
            meeting_id: meetingId,
            meetings_participant_id: Number(participantId),
            status: 'PENDING'
          },
          data: { status: 'REJECTED' }
        });
        io.to(roomId).emit('hand:refused', { participantId });
      } catch (error) {
        console.error('Error refusing hand:', error);
      }
    });

    socket.on('hand:mute', ({ roomId, participantId }) => {
      io.to(roomId).emit('hand:muted', { participantId });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`> Ready on http://0.0.0.0:${PORT}`);
  });
});
