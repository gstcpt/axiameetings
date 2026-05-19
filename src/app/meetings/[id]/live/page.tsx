'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import {
  LiveKitRoom,
  VideoConference,
} from '@livekit/components-react';
import '@livekit/components-styles';
import './live-view.css';
import { useAuth } from '@/components/context/AuthContext';
import { Meeting, ApiResponse } from '@/lib/types';
import { VoteModal } from '@/components/VoteModal';
import {
  Users,
  ListTodo,
  Hand,
  Vote as VoteIcon,
  Shield,
  MicOff,
  VideoOff,
  LogOut,
  Play,
  CalendarDays,
  FileText,
  Download,
  Check,
  X,
  Bell,
  BarChart3,
  Clock,
  ExternalLink,
  Plus,
  ArrowLeft,
  Upload,
  Loader2
} from 'lucide-react';
import { Modal } from '@/components/ui/modals';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/ui/typographys';
import { Badge } from '@/components/ui/badges';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useLocalParticipant } from '@livekit/components-react';

export default function LiveMeetingPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [lkToken, setLkToken] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'agenda' | 'participants' | 'documents'>('agenda');
  const [isVoteActive, setIsVoteActive] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [joinRequests, setJoinRequests] = useState<{ participantId: number; name: string; socketId: string }[]>([]);
  const [currentVote, setCurrentVote] = useState<{ noteId: number; description: string; duration: number } | null>(null);
  const [finishedVotes, setFinishedVotes] = useState<Record<number, { oui: number; non: number; neutre: number }>>({});
  const [showResultsOverlay, setShowResultsOverlay] = useState<{ results: any, description: string } | null>(null);
  const [raisedHands, setRaisedHands] = useState<{ participantId: number; name: string; status: 'PENDING' | 'ACCEPTED' }[]>([]);
  const [meetingStatus, setMeetingStatus] = useState<string>('SCHEDULED');
  const [isStarting, setIsStarting] = useState(false);
  const [isEndConfirmModalOpen, setIsEndConfirmModalOpen] = useState(false);
  const [isEndingMeeting, setIsEndingMeeting] = useState(false);
  const [isMeetingEndedModalOpen, setIsMeetingEndedModalOpen] = useState(false);
  const t = useTranslations('LiveMeeting');
  const tc = useTranslations('Common');
  const tv = useTranslations('VoteModal');

  // New Voting State
  const [voteResults, setVoteResults] = useState({ oui: 0, non: 0, neutre: 0 });
  const [voteTimeLeft, setVoteTimeLeft] = useState(0);

  // Add Document Modal State
  const [isAddDocModalOpen, setIsAddDocModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocFile, setNewDocFile] = useState<File | null>(null);

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const isAdminOrDev = user?.role === 'ADMIN' || user?.role === 'DEVELOPER';

  // Vote Countdown Timer
  useEffect(() => {
    let timer: any;
    if (isVoteActive && voteTimeLeft > 0) {
      timer = setInterval(() => {
        setVoteTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isVoteActive, voteTimeLeft]);

  // 1. Initial Data Fetching & Auth
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const url = `/api/meetings/${id}/live${token ? `?token=${token}&email=${encodeURIComponent(email || '')}` : ''}`;
        const res = await fetch(url);
        const result: ApiResponse<any> = await res.json();

        if (!isMounted) return;

        if (!result.status) {
          if ((result as any).requireAcceptance) {
            toast.error(t('toasts.requireAcceptance'));
            router.push(`/meetings/${id}/join?token=${token}&email=${email}`);
          } else {
            toast.error(result.message || t('toasts.unauthorized'));
            router.push(user ? '/meetings' : '/');
          }
          return;
        }

        const data = result.data;
        const currentPartId = (result as any).participantId;

        setMeeting(data);
        setMeetingStatus(data.status || 'SCHEDULED');
        if (currentPartId) setParticipantId(currentPartId);

        if (data.status === 'STARTED' || user?.role === 'ADMIN' || user?.role === 'DEVELOPER') {
          setIsJoined(true);
        }

        // Initialize Finished Votes from DB if available
        if (data.meetings_points) {
          const finished: any = {};
          data.meetings_points.forEach((p: any) => {
            if (p.meetings_votes && p.meetings_votes.length > 0) {
              const counts = { oui: 0, non: 0, neutre: 0 };
              p.meetings_votes.forEach((v: any) => {
                if (v.vote === 'OUI') counts.oui++;
                else if (v.vote === 'NON') counts.non++;
                else if (v.vote === 'NEUTRE') counts.neutre++;
              });
              finished[p.id] = counts;
            } else if (p.is_voted) {
              finished[p.id] = { oui: p.vote_oui || 0, non: p.vote_non || 0, neutre: p.vote_neutre || 0 };
            }
          });
          setFinishedVotes(finished);
        }

        // Initialize Raised Hands from DB
        if (data.meetings_turn_requests) {
          const pending = data.meetings_turn_requests
            .map((r: any) => {
              const participant = data.meetings_participants?.find((p: any) => p.id === r.meetings_participant_id);
              return {
                participantId: r.meetings_participant_id,
                name: participant?.email || 'Participant',
                status: 'PENDING'
              };
            });
          setRaisedHands(pending);
        }

        // Handle Identity
        let identity = '';
        if (user) {
          identity = user.fullname || user.username || 'Admin';
        } else if (email) {
          identity = email;
        }

        // Get LiveKit Token
        const lkRes = await fetch(`/api/livekit?room=meeting-${id}&username=${encodeURIComponent(identity)}`);
        const lkData = await lkRes.json();
        if (!isMounted) return;

        if (lkData.token) {
          setLkToken(lkData.token);
        } else {
          setLkToken('not-configured');
          if (lkData.configured === false) {
            toast(t('toasts.livekitUnavailable'), { duration: 6000 });
          }
        }

        // Initialize Socket
        try {
          if (socketRef.current) {
            socketRef.current.disconnect();
          }

          const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;
          
          if (socketUrl.includes('.vercel.app')) {
            console.warn('Socket.io connection bypassed: Vercel serverless environments do not support stateful Socket.io servers. If real-time features are needed, please set NEXT_PUBLIC_SOCKET_URL to a stateful WebSocket server.');
            return;
          }

          const newSocket = io(socketUrl, {
            timeout: 5000,
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
          });

          socketRef.current = newSocket;
          setSocket(newSocket);

          newSocket.on('connect', () => {
            newSocket.emit('join-room', `meeting-${id}`);
            if (!user && currentPartId) {
              newSocket.emit('join:request', { roomId: `meeting-${id}`, participantId: currentPartId, name: identity });
            }
          });

          newSocket.on('connect_error', (error) => {
            console.warn('Live meeting socket connection error:', error.message);
          });

          newSocket.on('vote:started', ({ noteId, duration, description }) => {
            setCurrentVote({ noteId, duration, description: description || 'Vote sur le point en cours' });
            setIsVoteActive(true);
            setVoteResults({ oui: 0, non: 0, neutre: 0 });
            setVoteTimeLeft(duration);
          });

          newSocket.on('vote:update', ({ vote }) => {
            setVoteResults(prev => {
              if (vote === 'OUI') return { ...prev, oui: prev.oui + 1 };
              if (vote === 'NON') return { ...prev, non: prev.non + 1 };
              if (vote === 'NEUTRE') return { ...prev, neutre: prev.neutre + 1 };
              return prev;
            });
          });

          newSocket.on('vote:ended', ({ results, noteId, description }) => {
            setIsVoteActive(false);
            const safeResults = results || { oui: 0, non: 0, neutre: 0 };
            if (noteId) {
              setFinishedVotes(prev => ({ ...prev, [noteId]: safeResults }));
            }
            setCurrentVote(null);

            // Show Results Overlay for 5 seconds
            setShowResultsOverlay({ results: safeResults, description });
            setTimeout(() => setShowResultsOverlay(null), 5000);

            if (user?.role === 'ADMIN' || user?.role === 'DEVELOPER') {
              toast.success(t('toasts.voteEnded'));
            }
          });

          newSocket.on('hand:raised', ({ participantId, name }) => {
            setRaisedHands(prev => {
              if (prev.find(h => h.participantId === participantId)) return prev;
              return [...prev, { participantId, name, status: 'PENDING' }];
            });
            if (user?.role === 'ADMIN' || user?.role === 'DEVELOPER') {
              toast(t('toasts.handRaised', { name }), { icon: '✋' });
            }
          });

          newSocket.on('hand:accepted', ({ participantId }) => {
            setRaisedHands(prev => prev.map(h => h.participantId === participantId ? { ...h, status: 'ACCEPTED' } : h));
            if (currentPartId === participantId) toast.success(t('toasts.wordGranted'));
          });

          newSocket.on('hand:refused', ({ participantId: pId }) => {
            setRaisedHands(prev => prev.filter(h => h.participantId !== pId));
            if (participantId === pId) toast.error(t('toasts.wordRefused'));
          });

          newSocket.on('hand:muted', ({ participantId: pId }) => {
            setRaisedHands(prev => prev.filter(h => h.participantId !== pId));
            if (participantId === pId) toast.info(t('toasts.wordEnded'));
          });

          newSocket.on('join:requested', ({ participantId, name, socketId }) => {
            if (user?.role === 'ADMIN' || user?.role === 'DEVELOPER') {
              setJoinRequests(prev => {
                if (prev.find(r => r.socketId === socketId || r.participantId === participantId)) return prev;
                return [...prev, { participantId, name, socketId }];
              });
              toast.info(t('toasts.joinRequested', { name }));
            }
          });

          newSocket.on('join:accepted', () => {
            setIsJoined(true);
            toast.success(t('toasts.joinAccepted'));
          });

          newSocket.on('join:rejected', () => {
            toast.error(t('toasts.joinRejected'));
            router.push('/');
          });

          newSocket.on('meeting:started', () => {
            setMeetingStatus('STARTED');
            setIsJoined(true);
            toast.info(t('toasts.meetingStarted'));
          });

          newSocket.on('join:approved', ({ participantId }) => {
            setJoinRequests(prev => prev.filter(req => req.participantId !== participantId));
          });

          newSocket.on('meeting:ended', () => {
            setMeetingStatus('FINISHED');
            setIsMeetingEndedModalOpen(true);
          });

        } catch (err) {
          console.error('Socket init error:', err);
        }
      } catch (error) {
        console.error('Init error:', error);
        if (isMounted) toast.error(tc('error'));
      }
    };

    init();

    return () => {
      isMounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [id, user, email, token, router]);

  const startMeeting = async () => {
    if (isStarting) return;
    setIsStarting(true);
    try {
      const res = await fetch(`/api/meetings/${id}/live`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_status', status: 'STARTED' }),
      });
      const result = await res.json();
      if (result.status) {
        setMeetingStatus('STARTED');
        socket?.emit('meeting:start', { roomId: `meeting-${id}` });
        toast.success(t('toasts.meetingStartedAdmin'));
        if (result.expiredToken) {
          const msg = result.pushMessage ? `Notification Push: ${result.pushMessage}` : "Notification Push: Jeton expiré.";
          toast.warning(msg, { duration: 10000 });
        }
      } else {
        toast.error(result.message || tc('error'));
      }
    } catch {
      toast.error(tc('error'));
    } finally {
      setIsStarting(false);
    }
  };

  const handleVote = (vote: 'Oui' | 'Non' | 'Neutre') => {
    if (!socket || !currentVote || !participantId) {
      if (!participantId) toast.error(t('toasts.notRegistered'));
      return;
    }
    socket.emit('vote:submit', {
      roomId: `meeting-${id}`,
      noteId: currentVote.noteId,
      participantId: participantId,
      vote
    });
    setIsVoteActive(false);
    toast.success(t('toasts.voteRecorded'));
  };

  const raiseHand = () => {
    if (!socket || !meeting || !participantId) {
      if (!participantId) toast.error(t('toasts.notAuthorizedWord'));
      return;
    }
    const name = user?.fullname || email || 'Participant';
    socket.emit('hand:raise', {
      roomId: `meeting-${id}`,
      participantId: participantId,
      name
    });
    toast.success(t('toasts.handRaisedSuccess'));
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocFile) {
      toast.error(tc('selectRequired'));
      return;
    }

    setIsUploading(true);
    try {
      // 1. Upload the file
      const formData = new FormData();
      formData.append('file', newDocFile);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const uploadResult = await uploadRes.json();

      if (!uploadResult.status) {
        throw new Error(uploadResult.message || 'Upload failed');
      }

      // 2. Link the document to the meeting
      const linkRes = await fetch(`/api/meetings/${id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_title: newDocTitle || newDocFile.name,
          file_path: uploadResult.data.file_path,
        }),
      });
      const linkResult = await linkRes.json();

      if (linkResult.status) {
        toast.success(t('toasts.docAdded'));
        setIsAddDocModalOpen(false);
        setNewDocTitle('');
        setNewDocFile(null);

        // Refresh meeting data to show new document
        const res = await fetch(`/api/meetings/${id}/live${token ? `?token=${token}&email=${encodeURIComponent(email || '')}` : ''}`);
        const result = await res.json();
        if (result.status) setMeeting(result.data);
      } else {
        throw new Error(linkResult.message || 'Linking failed');
      }
    } catch (error: any) {
      console.error('Error adding document:', error);
      toast.error(error.message || tc('error'));
    } finally {
      setIsUploading(false);
    }
  };

  if (!meeting) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0B1120] gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent shadow-[0_0_20px_rgba(59,130,246,0.3)]"></div>
        <Typography variant="label" className="text-slate-400">{t('loading.preparing')}</Typography>
      </div>
    );
  }

  if (!isAdminOrDev && meetingStatus === 'SCHEDULED') {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B1120] p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full p-10 bg-slate-900/50 backdrop-blur-2xl rounded-2xl border border-white/5 text-center relative overflow-hidden shadow-2xl"
        >
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(white 1.5px, transparent 1.5px)', backgroundSize: '32px 32px' }} />
          <div className="w-20 h-20 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6 animate-pulse shadow-[0_0_50px_rgba(59,130,246,0.2)] border border-blue-500/20">
            <CalendarDays size={40} />
          </div>
          <Typography variant="h2" className="text-white mb-3 text-xl font-semibold">{t('status.soon.title')}</Typography>
          <Typography variant="p" className="text-slate-400 mb-8 leading-relaxed text-sm">
            {t('status.soon.message')}
          </Typography>
          <div className="flex items-center justify-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.3s]"></div>
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.15s]"></div>
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce"></div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B1120] p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full p-10 bg-slate-900/50 backdrop-blur-2xl rounded-2xl border border-white/5 text-center shadow-2xl"
        >
          <div className="w-20 h-20 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_50px_rgba(59,130,246,0.2)] border border-blue-500/20">
            <Shield size={40} />
          </div>
          <Typography variant="h2" className="text-white mb-3 text-xl font-semibold">{t('status.waiting.title')}</Typography>
          <Typography variant="p" className="text-slate-400 mb-8 text-sm">{t('status.waiting.message')}</Typography>
          <div className="flex items-center justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.3s]"></div>
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.15s]"></div>
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-bounce"></div>
          </div>
          <Button variant="ghost" className="mt-10 text-slate-500 hover:text-white uppercase font-semibold text-xs" onClick={() => router.push('/')}>
            {t('status.waiting.cancel')}
          </Button>
        </motion.div>
      </div>
    );
  }

  const notificationCount = raisedHands.length + joinRequests.length;

  return (
    <div className="flex h-screen flex-col bg-[#020617] overflow-hidden font-sans text-slate-200">
      {/* Header */}
      <header className="flex h-16 items-center justify-between border-b border-white/5 bg-[#0B1120]/80 backdrop-blur-xl px-6 z-30 shadow-2xl">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/meetings')} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:bg-white/10 hover:text-white transition-all border border-white/5">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#002B5B] shadow-[0_0_20px_rgba(0,43,91,0.3)] text-white border border-white/10">
              <Shield size={18} />
            </div>
            <div>
              <Typography variant="h3" className="text-white leading-none text-base font-semibold">{meeting.subject}</Typography>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge variant="outline" className="text-[9px] py-0 px-2 border-white/10 text-slate-500 font-semibold uppercase">{meeting.type}</Badge>
                <span className="text-[9px] text-slate-600 font-semibold uppercase">•</span>
                <div className="flex items-center gap-1.5 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                  <div className="h-1 w-1 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.6)]"></div>
                  <span className="text-[9px] font-semibold text-green-400 uppercase">{t('header.statusLive')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAdminOrDev && meetingStatus === 'STARTED' && (
            <Button
              variant="destructive"
              className="h-10 rounded-xl px-6 text-[10px] font-semibold uppercase bg-red-600/10 text-red-500 border border-red-500/20 hover:bg-red-600 hover:text-white transition-all shadow-xl shadow-red-900/10"
              onClick={() => setIsEndConfirmModalOpen(true)}
            >
              {t('header.endButton')}
            </Button>
          )}

          <Button variant="ghost" size="icon" className="w-10 h-10 rounded-xl text-slate-400 hover:bg-white/5 hover:text-white" onClick={() => router.push('/meetings')}>
            <LogOut size={18} />
          </Button>
        </div>
      </header>

      {/* Start Meeting Banner for Admin */}
      {isAdminOrDev && meetingStatus === 'SCHEDULED' && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="bg-blue-600/20 border-b border-blue-500/20 px-6 py-3 flex items-center justify-between text-white shadow-inner z-20 backdrop-blur-xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/30 flex items-center justify-center shadow-lg border border-blue-500/20">
              <Play size={16} className="text-blue-400 ml-0.5" fill="currentColor" />
            </div>
            <div>
              <Typography variant="large" className="text-white uppercase text-[10px] font-semibold">{t('banner.ready')}</Typography>
              <Typography variant="small" className="text-blue-200/70 mt-0.5 text-[10px]">{t('banner.desc')}</Typography>
            </div>
          </div>
          <Button
            disabled={isStarting}
            onClick={startMeeting}
            className="h-10 bg-blue-600 text-white hover:bg-blue-500 font-semibold px-6 rounded-xl shadow-[0_10px_20px_rgba(37,99,235,0.2)] transition-all hover:scale-105 active:scale-95 border border-blue-500/50 text-[10px] uppercase"
          >
            {isStarting ? t('banner.starting') : t('banner.start')}
          </Button>
        </motion.div>
      )}

      {/* Main Content */}
      <main className="flex flex-1 flex-col lg:flex-row overflow-hidden relative w-full">
        {/* Video Area */}
        <div className="flex-1 bg-[#020617] relative flex flex-col p-4 md:p-6">
          <div className="flex-1 rounded-2xl overflow-hidden border border-white/10 bg-[#080d1a] relative shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)]">
            {lkToken && lkToken !== 'not-configured' && isJoined && meetingStatus === 'STARTED' ? (
              <div className="absolute inset-0 flex flex-col">
                <LiveKitRoom
                  video={true}
                  audio={isAdminOrDev}
                  token={lkToken}
                  serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
                  connect={true}
                  onDisconnected={() => router.push('/meetings')}
                  className={cn(
                    "flex-1 flex flex-col custom-livekit-theme overflow-hidden",
                    isAdminOrDev ? "role-admin" : "role-participant",
                    raisedHands.find(h => h.participantId === participantId)?.status === 'ACCEPTED' && "hand-accepted"
                  )}
                >
                  <VideoConference />
                  <SpeakPermissionsController
                    isAdmin={isAdminOrDev}
                    isHandAccepted={raisedHands.find(h => h.participantId === participantId)?.status === 'ACCEPTED'}
                  />
                </LiveKitRoom>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-white/40 gap-5">
                <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-inner mb-4">
                  <Shield size={40} className="text-white/20" />
                </div>
                <div className="text-center space-y-3 max-w-md px-6">
                  <Typography variant="h3" className="text-white uppercase font-semibold text-sm">{t('video.livekitConnectivity')}</Typography>
                  <Typography variant="p" className="text-slate-500 font-medium leading-relaxed">
                    {meetingStatus === 'SCHEDULED'
                      ? (isAdminOrDev ? t('video.waitingAdmin') : t('video.waiting'))
                      : t('video.preparing')}
                  </Typography>
                  {isAdminOrDev && meetingStatus === 'SCHEDULED' && (
                    <div className="pt-4">
                      <Button
                        onClick={startMeeting}
                        disabled={isStarting}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 h-11 rounded-xl shadow-2xl shadow-blue-900/50 uppercase text-xs"
                      >
                        {isStarting ? t('banner.starting') : t('banner.start')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-full lg:w-[400px] h-[45vh] lg:h-full border-t lg:border-t-0 lg:border-l border-white/5 bg-[#0B1120] flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.3)] z-20 relative">

          {/* Tabs */}
          <div className="flex p-3 gap-2 border-b border-white/5 bg-white/[0.02]">
            <button
              onClick={() => setActiveTab('agenda')}
              className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-3 text-[10px] font-semibold uppercase transition-all rounded-xl border ${activeTab === 'agenda' ? 'bg-[#002B5B] text-white border-white/10 shadow-xl shadow-blue-900/20' : 'text-slate-500 border-transparent hover:bg-white/5 hover:text-slate-300'}`}
            >
              <ListTodo size={16} />
              {t('tabs.agenda')}
            </button>
            <button
              onClick={() => setActiveTab('participants')}
              className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-3 text-[10px] font-semibold uppercase transition-all rounded-xl border relative ${activeTab === 'participants' ? 'bg-[#002B5B] text-white border-white/10 shadow-xl shadow-blue-900/20' : 'text-slate-500 border-transparent hover:bg-white/5 hover:text-slate-300'}`}
            >
              <div className="relative">
                <Users size={16} />
                {(joinRequests.length + raisedHands.length) > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-semibold text-white shadow-[0_0_10px_rgba(239,68,68,0.4)] animate-pulse border-2 border-[#0B1120]">
                    {joinRequests.length + raisedHands.length}
                  </span>
                )}
              </div>
              {t('tabs.participants')}
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-3 text-[10px] font-semibold uppercase transition-all rounded-xl border ${activeTab === 'documents' ? 'bg-[#002B5B] text-white border-white/10 shadow-xl shadow-blue-900/20' : 'text-slate-500 border-transparent hover:bg-white/5 hover:text-slate-300'}`}
            >
              <FileText size={16} />
              {t('tabs.documents')}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            <AnimatePresence mode="wait">
              {/* AGENDA TAB */}
              {activeTab === 'agenda' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

                  {/* Creator Live Vote Dashboard */}
                  {isAdminOrDev && isVoteActive && currentVote && (
                    <div className="bg-linear-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 animate-pulse"></div>
                      <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                            <BarChart3 size={16} />
                          </div>
                          <Typography variant="label" className="text-white uppercase text-[10px] font-semibold">{t('agenda.voteInProgress')}</Typography>
                        </div>
                        <Badge className="bg-slate-900/80 text-blue-400 border-white/5 h-8 px-3 flex items-center gap-2 text-sm font-semibold">
                          <Clock size={14} />
                          {voteTimeLeft}s
                        </Badge>
                      </div>
                      <Typography variant="p" className="text-slate-300 mb-5 leading-relaxed italic text-xs">{currentVote.description}</Typography>

                      <div className="space-y-3 mb-6">
                        {[
                          { label: t('agenda.voteTypes.for'), value: voteResults.oui, color: 'bg-green-500', text: 'text-green-400' },
                          { label: t('agenda.voteTypes.against'), value: voteResults.non, color: 'bg-red-500', text: 'text-red-400' },
                          { label: t('agenda.voteTypes.neutral'), value: voteResults.neutre, color: 'bg-slate-500', text: 'text-slate-400' },
                        ].map((v) => (
                          <div key={v.label} className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] font-semibold uppercase">
                              <span className={v.text}>{v.label}</span>
                              <span className="text-white">{v.value}</span>
                            </div>
                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(v.value / Math.max(1, (voteResults.oui + voteResults.non + voteResults.neutre))) * 100}%` }}
                                className={cn("h-full transition-all duration-1000", v.color)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <Button
                        variant="outline"
                        className="w-full h-11 border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white rounded-xl font-semibold uppercase text-[10px]"
                        onClick={() => {
                          socket?.emit('vote:stop', {
                            roomId: `meeting-${id}`,
                            noteId: currentVote.noteId
                          });
                        }}
                      >
                        {t('agenda.stopVote')}
                      </Button>
                    </div>
                  )}

                  <div className="space-y-4">
                    {(meeting as any).meetings_points?.map((point: any, idx: number) => {
                      const result = finishedVotes[point.id] || (point.id ? finishedVotes[Number(point.id)] : null);
                      return (
                        <div key={point.id} className="p-5 rounded-2xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] transition-all group">
                          <div className="flex items-start gap-4">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs font-semibold text-slate-400 border border-white/5 shadow-inner transition-colors group-hover:bg-[#002B5B] group-hover:text-white group-hover:border-white/10">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <div className="flex-1 min-w-0">
                              <Typography variant="large" className="text-white text-sm font-semibold">{point.point}</Typography>

                              {result ? (
                                <div className="mt-4 p-4 bg-slate-900/50 rounded-xl border border-emerald-500/20 shadow-2xl shadow-emerald-900/5 space-y-3">
                                  <div className="flex items-center justify-between text-[9px] font-semibold uppercase text-emerald-400 mb-1">
                                    <div className="flex items-center gap-2">
                                      <BarChart3 size={12} />
                                      <span>{t('overlays.voteResults.title')}</span>
                                    </div>
                                    <Badge className="bg-emerald-500 text-white border-none h-4 px-1.5 rounded-full text-[7px]">{tc('status.finished') || 'Terminé'}</Badge>
                                  </div>
                                  <div className="flex gap-4 pt-2">
                                    <div className="flex-1">
                                      <div className="flex justify-between text-[9px] mb-1 font-bold">
                                        <span className="text-emerald-400/80">{t('agenda.voteTypes.for')}</span>
                                        <span className="text-white">{result.oui}</span>
                                      </div>
                                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" style={{ width: `${(result.oui / Math.max(1, result.oui + result.non + result.neutre)) * 100}%` }} />
                                      </div>
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex justify-between text-[9px] mb-1 font-bold">
                                        <span className="text-rose-400/80">{t('agenda.voteTypes.against')}</span>
                                        <span className="text-white">{result.non}</span>
                                      </div>
                                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]" style={{ width: `${(result.non / Math.max(1, result.oui + result.non + result.neutre)) * 100}%` }} />
                                      </div>
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex justify-between text-[9px] mb-1 font-bold">
                                        <span className="text-slate-400/80">{t('agenda.voteTypes.neutral')}</span>
                                        <span className="text-white">{result.neutre}</span>
                                      </div>
                                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-slate-400" style={{ width: `${(result.neutre / Math.max(1, result.oui + result.non + result.neutre)) * 100}%` }} />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : point.type === 'VOTE' ? (
                                <div className="mt-5 flex items-center justify-between gap-4">
                                  <Badge variant="outline" className="h-6 border-blue-500/20 bg-blue-500/5 text-blue-400 font-semibold uppercase text-[8px] px-2 rounded-md flex items-center gap-1.5">
                                    <div className="w-1 h-1 rounded-full bg-blue-500"></div>
                                    {t('agenda.submittedToVote')}
                                  </Badge>

                                  {isAdminOrDev && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={isVoteActive}
                                      className="h-9 px-4 text-[9px] uppercase font-semibold border-blue-500/20 bg-blue-500/10 text-white hover:bg-blue-600 hover:text-white hover:border-blue-500 transition-all rounded-lg shadow-lg shadow-blue-900/10"
                                      onClick={() => {
                                        socket?.emit('vote:start', {
                                          roomId: `meeting-${id}`,
                                          noteId: point.id,
                                          description: point.point,
                                          duration: 60
                                        });
                                      }}
                                    >
                                      {t('agenda.launchVote')}
                                    </Button>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* PARTICIPANTS TAB */}
              {activeTab === 'participants' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">

                  {/* Join Requests */}
                  {isAdminOrDev && joinRequests.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-2">
                        <Typography variant="label" className="text-slate-500 uppercase text-[10px] font-semibold">{t('participants.requests')}</Typography>
                        <Badge className="bg-blue-600 text-white rounded-full h-5 min-w-[20px] border-none font-semibold text-[10px]">{joinRequests.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {joinRequests.map((req) => (
                          <div key={req.socketId} className="flex items-center justify-between p-4 bg-blue-600/10 border border-blue-500/20 rounded-xl shadow-lg shadow-blue-900/50">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white border border-white/10">
                                <Users size={16} />
                              </div>
                              <Typography variant="large" className="text-blue-100 text-sm font-semibold">{req.name}</Typography>
                            </div>
                            <div className="flex gap-2">
                              <Button size="icon" className="h-9 w-9 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg shadow-lg shadow-emerald-900/20" onClick={() => socket?.emit('join:accept', { roomId: `meeting-${id}`, participantId: req.participantId, socketId: req.socketId })}>
                                <Check size={16} />
                              </Button>
                              <Button size="icon" variant="outline" className="h-9 w-9 border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white rounded-lg" onClick={() => socket?.emit('join:reject', { socketId: req.socketId })}>
                                <X size={16} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hand Raises */}
                  {raisedHands.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-2">
                        <Typography variant="label" className="text-slate-500 uppercase text-[10px] font-semibold">{t('participants.handRaises')}</Typography>
                        <Badge className="bg-amber-500 text-white rounded-full h-5 min-w-[20px] border-none font-semibold text-[10px]">{raisedHands.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {raisedHands.map((hand) => (
                          <div key={hand.participantId} className={cn(
                            "flex items-center justify-between p-4 border rounded-xl relative overflow-hidden transition-all",
                            hand.status === 'ACCEPTED' ? 'bg-emerald-600/10 border-emerald-500/30 shadow-emerald-900/10' : 'bg-amber-600/10 border-amber-500/30 shadow-amber-900/10'
                          )}>
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${hand.status === 'ACCEPTED' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                            <div className="flex items-center gap-3 ml-1">
                              <div className={cn(
                                "h-9 w-9 rounded-lg flex items-center justify-center border",
                                hand.status === 'ACCEPTED' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              )}>
                                {hand.status === 'ACCEPTED' ? <MicOff size={16} /> : <Hand size={16} />}
                              </div>
                              <Typography variant="large" className={cn("text-sm font-semibold", hand.status === 'ACCEPTED' ? 'text-emerald-100' : 'text-amber-100')}>{hand.name}</Typography>
                            </div>
                            {isAdminOrDev && (
                              <div className="flex gap-2">
                                {hand.status === 'PENDING' ? (
                                  <>
                                    <Button size="icon" className="h-9 w-9 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg shadow-lg shadow-emerald-900/20" onClick={() => socket?.emit('hand:accept', { roomId: `meeting-${id}`, participantId: hand.participantId })}>
                                      <Check size={16} />
                                    </Button>
                                    <Button size="icon" variant="outline" className="h-9 w-9 border-white/10 text-slate-400 hover:bg-white/10 rounded-lg" onClick={() => socket?.emit('hand:refuse', { roomId: `meeting-${id}`, participantId: hand.participantId })}>
                                      <X size={16} />
                                    </Button>
                                  </>
                                ) : (
                                  <Button size="icon" className="h-9 w-9 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-lg shadow-red-900/20" onClick={() => socket?.emit('hand:mute', { roomId: `meeting-${id}`, participantId: hand.participantId })}>
                                    <MicOff size={16} />
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <Typography variant="label" className="text-slate-500 uppercase text-[10px] font-semibold px-2">{t('participants.all')}</Typography>
                    <div className="space-y-2">
                      {(meeting as any).meetings_participants?.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between p-3.5 bg-white/[0.02] hover:bg-white/[0.05] rounded-xl transition-all border border-transparent hover:border-white/5 group">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-semibold text-slate-400 border border-white/5 shadow-inner uppercase group-hover:bg-[#002B5B] group-hover:text-white transition-all">
                              {p.email[0]}
                            </div>
                            <Typography variant="large" className="text-xs text-slate-400 group-hover:text-white transition-colors truncate max-w-[200px]">{p.email}</Typography>
                          </div>
                          <div className="flex gap-2 text-slate-500">
                            {isAdminOrDev && p.email === user?.email && (
                              <Badge variant="primary" className="bg-blue-600/10 text-blue-400 border-blue-500/20 text-[8px] font-semibold uppercase">Host</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {!isAdminOrDev && (
                    <div className="mt-6 pt-6 border-t border-white/5">
                      <div className="p-6 bg-slate-900/50 rounded-2xl border border-white/5 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="relative flex flex-col items-center text-center">
                          <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                            <Hand size={24} />
                          </div>
                          <Typography variant="h4" className="text-white mb-1.5 text-base font-semibold">{t('actions.requestWord')}</Typography>
                          <Typography variant="small" className="text-slate-400 mb-5 text-[10px]">{t('permissions.muteNote')}</Typography>

                          {raisedHands.find(h => h.participantId === participantId)?.status === 'PENDING' ? (
                            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 px-5 py-1.5 rounded-lg uppercase text-[9px] font-semibold">{t('actions.requestPending')}</Badge>
                          ) : raisedHands.find(h => h.participantId === participantId)?.status === 'ACCEPTED' ? (
                            <div className="flex flex-col items-center gap-2">
                              <Badge className="bg-emerald-500 text-white border-none px-5 py-1.5 rounded-lg uppercase text-[9px] font-semibold">{t('actions.permissionGranted')}</Badge>
                              <Button variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white rounded-lg h-7 text-[8px] uppercase font-semibold" onClick={() => socket?.emit('hand:mute', { roomId: `meeting-${id}`, participantId: participantId })}>{t('actions.stopIntervention')}</Button>
                            </div>
                          ) : (
                            <Button
                              className="w-full h-10 bg-blue-600 hover:bg-blue-500 text-white font-semibold uppercase text-[10px] rounded-xl shadow-xl shadow-blue-900/20"
                              onClick={() => {
                                const identity = user?.fullname || user?.username || email || 'Participant';
                                socket?.emit('hand:raise', { roomId: `meeting-${id}`, participantId: participantId, name: identity });
                              }}
                            >
                              {t('actions.requestWord')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* DOCUMENTS TAB */}
              {activeTab === 'documents' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  {isAdminOrDev && (
                    <motion.div
                      whileHover={{ y: -2 }}
                      className="p-6 rounded-2xl bg-linear-to-br from-blue-600/10 to-indigo-600/10 border border-blue-500/20 mb-2 group hover:bg-blue-600/20 transition-all cursor-pointer text-center relative overflow-hidden"
                      onClick={() => setIsAddDocModalOpen(true)}
                    >
                      <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center mx-auto mb-3 text-blue-400 group-hover:scale-110 group-hover:rotate-6 transition-transform border border-blue-500/20">
                        <Plus size={24} />
                      </div>
                      <Typography variant="large" className="text-blue-400 uppercase text-[10px] font-semibold">{t('documents.add')}</Typography>
                    </motion.div>
                  )}

                  <div className="space-y-4">
                    {!(meeting as any).meetings_documents?.length && (
                      <div className="text-center py-16 opacity-20 flex flex-col items-center">
                        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-slate-400">
                          <FileText size={32} />
                        </div>
                        <Typography variant="label" className="uppercase text-[10px] font-semibold">{t('documents.empty')}</Typography>
                      </div>
                    )}

                    {(meeting as any).meetings_documents?.map((doc: any) => (
                      <div key={doc.id} className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-blue-500/30 transition-all group shadow-xl">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:bg-[#002B5B] group-hover:text-white transition-all shadow-inner">
                            <FileText size={18} className="text-slate-500 group-hover:text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <Typography variant="large" className="text-white truncate block text-sm font-semibold">{doc.file_title || 'Document'}</Typography>
                            <Typography variant="small" className="text-slate-600 mt-0.5 uppercase text-[9px] font-semibold">{t('documents.fileDocument')}</Typography>
                          </div>
                        </div>
                        <div className="mt-6 flex gap-3">
                          <Button
                            variant="outline"
                            className="flex-1 h-10 text-[10px] font-semibold uppercase border-white/5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl"
                            onClick={() => window.open(doc.file_path, '_blank')}
                          >
                            <ExternalLink size={14} className="mr-2" /> {t('documents.open')}
                          </Button>
                          <Button
                            className="flex-1 h-10 text-[10px] font-semibold uppercase bg-[#002B5B] hover:bg-blue-600 text-white shadow-xl shadow-blue-900/10 rounded-xl border border-white/10"
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = doc.file_path;
                              link.download = doc.file_title;
                              link.click();
                            }}
                          >
                            <Download size={14} className="mr-2" /> {t('documents.download')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom Actions */}
          {!isAdminOrDev && (
            <div className="p-4 border-t border-white/5 bg-[#0B1120]/80 backdrop-blur-xl shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
              <Button
                className="w-full h-12 rounded-xl bg-[#002B5B] hover:bg-blue-700 text-white font-semibold uppercase text-[10px] shadow-[0_15px_30px_rgba(0,43,91,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] border border-white/10"
                onClick={raiseHand}
              >
                <Hand size={16} className="mr-2" />
                {t('actions.requestWord')}
              </Button>
            </div>
          )}
        </aside>
      </main>

      {/* End Meeting Confirmation Modal (Admin) */}
      <Modal
        isOpen={isEndConfirmModalOpen}
        onClose={() => setIsEndConfirmModalOpen(false)}
        title={t('modals.endConfirm.title')}
        size="md"
      >
        <div className="space-y-5 text-center py-2">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <LogOut size={32} />
          </div>
          <Typography variant="h3" className="text-white uppercase font-semibold text-base">{t('modals.endConfirm.title')}</Typography>
          <Typography variant="p" className="text-slate-400 text-sm">{t('modals.endConfirm.desc')} {t('modals.endConfirm.irreversible')}</Typography>
          
          <div className="flex gap-4 pt-2">
            <Button variant="ghost" className="flex-1 h-11 rounded-xl text-slate-400 font-semibold uppercase text-[10px]" onClick={() => setIsEndConfirmModalOpen(false)}>{tc('cancel')}</Button>
            <Button 
              className="flex-1 h-11 bg-red-600 hover:bg-red-500 text-white font-semibold uppercase text-[10px] rounded-xl shadow-xl shadow-red-900/20"
              onClick={async () => {
                setIsEndConfirmModalOpen(false);
                setIsEndingMeeting(true);
                try {
                  const res = await fetch(`/api/meetings/${id}/live`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'update_status', status: 'FINISHED' }),
                  });
                  const result = await res.json();
                  if (result.status) {
                    socket?.emit('meeting:end', { roomId: `meeting-${id}` });
                    toast.success(t('toasts.finishedSuccess'));
                    router.push('/meetings');
                  } else {
                    toast.error(result.message || t('toasts.finishedError'));
                    setIsEndingMeeting(false);
                  }
                } catch { 
                  toast.error(t('toasts.finishedError')); 
                  setIsEndingMeeting(false);
                }
              }}
            >
              {tc('confirm')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Meeting Ended Modal (Everyone) */}
      <Modal
        isOpen={isMeetingEndedModalOpen}
        onClose={() => {}}
        title={t('modals.meetingOver.title')}
        size="md"
      >
        <div className="space-y-5 text-center py-2">
          <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-bounce">
            <Shield size={32} />
          </div>
          <Typography variant="h3" className="text-white uppercase font-semibold text-base">{t('modals.meetingOver.title')}</Typography>
          <Typography variant="p" className="text-slate-400 text-sm">{t('modals.meetingOver.desc')}</Typography>
          
          <div className="pt-4">
            <Button 
              className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-semibold uppercase text-[10px] rounded-xl shadow-xl shadow-blue-900/20"
              onClick={() => router.push(user ? '/meetings' : '/')}
            >
              {t('modals.meetingOver.backHome')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Loading Overlay for Admin Ending Meeting */}
      <AnimatePresence>
        {isEndingMeeting && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] bg-[#020617] flex flex-col items-center justify-center text-center p-8"
          >
            <div className="relative mb-8">
               <div className="w-20 h-20 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
               <div className="absolute inset-0 flex items-center justify-center">
                  <Shield size={28} className="text-blue-600 animate-pulse" />
               </div>
            </div>
            <Typography variant="h2" className="text-white uppercase font-semibold mb-3 text-lg">{t('overlays.ending.title')}</Typography>
            <Typography variant="p" className="text-slate-500 max-w-sm mx-auto leading-relaxed text-sm">
              {t('overlays.ending.desc')}
            </Typography>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vote Modal for Participants (Admins see the inline dashboard) */}
      {!isAdminOrDev && isVoteActive && currentVote && (
        <VoteModal
          description={currentVote.description}
          duration={currentVote.duration}
          onVote={handleVote}
        />
      )}

      {/* 5-Second Results Overlay */}
      <AnimatePresence>
        {showResultsOverlay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          >
          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-8 max-w-xl w-full shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600"></div>
              <div className="text-center mb-8">
                <Badge className="mb-3 bg-blue-600/10 text-blue-400 border-blue-500/20 px-3 py-1 uppercase text-[10px] font-semibold">{t('overlays.voteResults.title')}</Badge>
                <Typography variant="h3" className="text-white leading-tight mb-2 text-lg font-semibold">{showResultsOverlay.description}</Typography>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                  { label: tv('options.yes'), value: showResultsOverlay.results?.oui || 0, color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/30' },
                  { label: tv('options.no'), value: showResultsOverlay.results?.non || 0, color: 'text-rose-400', bg: 'bg-rose-500/20', border: 'border-rose-500/30' },
                  { label: tv('options.neutral'), value: showResultsOverlay.results?.neutre || 0, color: 'text-slate-400', bg: 'bg-slate-500/20', border: 'border-slate-500/30' },
                ].map(r => (
                  <div key={r.label} className={cn("p-5 rounded-xl border text-center", r.bg, r.border)}>
                    <Typography variant="small" className={cn("uppercase font-semibold mb-1.5 block text-[10px]", r.color)}>{r.label}</Typography>
                    <Typography variant="h2" className="text-white font-semibold text-xl">{r.value}</Typography>
                  </div>
                ))}
              </div>

              <div className="flex justify-center">
                <div className="flex items-center gap-2 text-slate-500 text-[10px] uppercase font-semibold">
                  <Clock size={12} className="animate-spin" />
                  {t('overlays.voteResults.autoClose')}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Document Modal */}
      <Modal
        isOpen={isAddDocModalOpen}
        onClose={() => !isUploading && setIsAddDocModalOpen(false)}
        title={tc('modals.addDocument.title')}
        size="md"
      >
        <form onSubmit={handleAddDocument} className="space-y-6">
          <div className="space-y-2">
            <Typography variant="label" className="text-slate-500 uppercase text-[10px] font-semibold">{tc('modals.addDocument.fileTitle')}</Typography>
            <input
              type="text"
              value={newDocTitle}
              onChange={(e) => setNewDocTitle(e.target.value)}
              placeholder={tc('modals.addDocument.fileTitle')}
              className="w-full h-11 px-4 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-hidden transition-all font-medium text-slate-900 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Typography variant="label" className="text-slate-500 uppercase text-[10px] font-semibold">{tc('modals.addDocument.upload')}</Typography>
            <div
              className={cn(
                "relative group cursor-pointer",
                isUploading && "opacity-50 cursor-not-allowed"
              )}
            >
              <input
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setNewDocFile(file);
                    if (!newDocTitle) setNewDocTitle(file.name.split('.')[0]);
                  }
                }}
                disabled={isUploading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
              />
              <div className={cn(
                "border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center transition-all group-hover:border-blue-500 group-hover:bg-blue-50/50",
                newDocFile && "border-blue-500 bg-blue-50/30"
              )}>
                <div className="w-14 h-14 bg-blue-500/10 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                  {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
                </div>
                {newDocFile ? (
                  <div className="space-y-1">
                    <Typography variant="large" className="text-blue-700 block truncate max-w-[250px] mx-auto">{newDocFile.name}</Typography>
                    <Typography variant="small" className="text-slate-500">{(newDocFile.size / 1024 / 1024).toFixed(2)} MB</Typography>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Typography variant="p" className="text-slate-600 font-medium">{tc('modals.addDocument.drop')}</Typography>
                    <Typography variant="small" className="text-slate-400">PDF, Word, Images, etc.</Typography>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={isUploading}
              onClick={() => setIsAddDocModalOpen(false)}
              className="flex-1 h-11 rounded-xl border-slate-100 hover:bg-slate-50 transition-all font-semibold text-slate-500 uppercase text-[10px]"
            >
              {tc('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isUploading || !newDocFile}
              className="flex-1 h-11 rounded-xl bg-[#002B5B] hover:bg-blue-800 text-white shadow-xl shadow-blue-900/10 transition-all font-semibold uppercase text-[10px]"
            >
              {isUploading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {tc('modals.addDocument.uploading')}
                </div>
              ) : (
                tc('modals.addDocument.submit')
              )}
            </Button>
          </div>
        </form>
      </Modal>
      <style jsx global>{`
        /* ... existing CSS ... */
      `}</style>
    </div>
  );
}

// Permissions controller to enforce 'Request to Speak' logic
function SpeakPermissionsController({ isAdmin, isHandAccepted }: { isAdmin: boolean; isHandAccepted: boolean }) {
  const { localParticipant } = useLocalParticipant();
  
  useEffect(() => {
    // If not admin and word not granted, keep microphone, camera and screen share disabled
    const enforceMute = async () => {
      if (!isAdmin && !isHandAccepted) {
        // Mute Mic
        if (localParticipant.isMicrophoneEnabled) {
          try {
            await localParticipant.setMicrophoneEnabled(false);
          } catch (err) {
            console.error("Failed to force mute mic:", err);
          }
        }
        // Mute Camera
        if (localParticipant.isCameraEnabled) {
          try {
            await localParticipant.setCameraEnabled(false);
          } catch (err) {
            console.error("Failed to force mute cam:", err);
          }
        }
        // Mute Screen Share
        if (localParticipant.isScreenShareEnabled) {
          try {
            await localParticipant.setScreenShareEnabled(false);
          } catch (err) {
            console.error("Failed to force mute screen:", err);
          }
        }
      }
    };
    
    // Execute IMMEDIATELY on change
    enforceMute();
    
    // Also listen to track changes to re-enforce (faster interval for better sync)
    const interval = setInterval(enforceMute, 1000);
    return () => clearInterval(interval);
  }, [isAdmin, isHandAccepted, localParticipant]); // This dependency array ensures instant reaction to isHandAccepted change

  return null;
}
