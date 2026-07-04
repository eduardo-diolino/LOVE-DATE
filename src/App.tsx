/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Download, 
  Heart, 
  Check, 
  Sparkles, 
  Trash2, 
  RotateCcw, 
  Calendar, 
  Clock, 
  MapPin, 
  X, 
  Edit3, 
  HeartHandshake 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, orderBy, onSnapshot, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { standaloneHtml } from './standaloneHtml';

interface HeartParticle {
  id: number;
  emoji: string;
  left: string;
  scale: number;
  duration: number;
  opacity: number;
}

interface DateResponse {
  id: string;
  place: string;
  date: string;
  time: string;
  rawDate: string;
  timestamp: string;
  status: 'active' | 'trash';
}

export default function App() {
  const [step, setStep] = useState<'proposal' | 'celebration' | 'planning' | 'thankyou'>('proposal');
  const [copied, setCopied] = useState(false);
  const [noBtnPos, setNoBtnPos] = useState({ x: 0, y: 0, isFixed: false });
  const [heartParticles, setHeartParticles] = useState<HeartParticle[]>([]);
  const noBtnRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastFleeTimeRef = useRef(0);

  // Form states
  const [selectedPlace, setSelectedPlace] = useState('Jantar Romântico');
  const [customPlace, setCustomPlace] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [lastSubmitted, setLastSubmitted] = useState<DateResponse | null>(null);

  // Admin Modal states
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState<'active' | 'trash'>('active');
  const [responses, setResponses] = useState<DateResponse[]>([]);
  
  // Inline editing states in admin modal
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPlace, setEditPlace] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [celebrationVideoSrc, setCelebrationVideoSrc] = useState('/celebration.mp4');
  const celebrationVideoSources = ['/celebration.mp4', '/celebration-1.mp4'];

  // Load and sync responses from Firestore in real-time
  useEffect(() => {
    const q = query(collection(db, 'respostas'), orderBy('criadoEm', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: DateResponse[] = [];
      snapshot.forEach((docSnap) => {
        const docData = docSnap.data();
        const mappedItem: DateResponse = {
          id: docData.id || docSnap.id,
          place: docData.lugar || docData.place || '',
          date: docData.data || docData.date || '',
          time: docData.hora || docData.time || '',
          rawDate: docData.rawDate || '',
          timestamp: docData.timestamp || (docData.criadoEm ? (docData.criadoEm.toDate ? docData.criadoEm.toDate() : new Date(docData.criadoEm)).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR')),
          status: docData.status === 'lixeira' ? 'trash' : 'active'
        };
        list.push(mappedItem);
      });
      setResponses(list);

      // Dynamically update lastSubmitted if it's currently on display and got updated
      setLastSubmitted((currentLastSubmitted) => {
        if (!currentLastSubmitted) return null;
        const updatedSelf = list.find((item) => item.id === currentLastSubmitted.id);
        if (!updatedSelf) return currentLastSubmitted;
        // Avoid setting state if nothing changed
        if (
          updatedSelf.place !== currentLastSubmitted.place ||
          updatedSelf.date !== currentLastSubmitted.date ||
          updatedSelf.time !== currentLastSubmitted.time ||
          updatedSelf.status !== currentLastSubmitted.status
        ) {
          return updatedSelf;
        }
        return currentLastSubmitted;
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'respostas');
    });

    // Set a default minimum date to today
    const today = new Date().toISOString().split('T')[0];
    setFormDate(today);

    return () => unsubscribe();
  }, []);

  // Handle robust video playback with sound or fallback to muted
  useEffect(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      if (step === 'celebration') {
        if (video.src !== window.location.origin + celebrationVideoSrc) {
          video.src = celebrationVideoSrc;
        }
        video.muted = false;
        video.currentTime = 0;
        video.play().catch((err) => {
          console.log("Autoplay unmuted was blocked by browser. Playing muted as fallback.", err);
          video.muted = true;
          video.play().catch((mutedErr) => {
            console.warn("Muted playback also failed inside useEffect:", mutedErr);
          });
        });
      } else {
        video.pause();
        video.currentTime = 0;
      }
    }
  }, [step, celebrationVideoSrc]);

  // Global keyboard listener for CTRL + ALT
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey) {
        e.preventDefault();
        setShowAdmin(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Download the index.html file
  const handleDownload = () => {
    const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'index.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Copy code to clipboard
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(standaloneHtml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Falha ao copiar:', err);
    }
  };

  // Move the NO button randomly within the safe bounds of the viewport
  const handleMoveNoButton = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    const now = Date.now();
    if (now - lastFleeTimeRef.current < 250) {
      if (e && e.cancelable) {
        e.preventDefault();
      }
      return;
    }
    lastFleeTimeRef.current = now;

    if (e) {
      if (e.cancelable) {
        e.preventDefault();
      }
      e.stopPropagation();
    }
    
    const btnWidth = noBtnRef.current ? noBtnRef.current.offsetWidth : 100;
    const btnHeight = noBtnRef.current ? noBtnRef.current.offsetHeight : 45;

    const padding = 20;
    const maxW = window.innerWidth - btnWidth - padding * 2;
    const maxH = window.innerHeight - btnHeight - padding * 2;

    const randomX = Math.max(padding, Math.floor(Math.random() * maxW) + padding);
    const randomY = Math.max(padding, Math.floor(Math.random() * maxH) + padding);

    setNoBtnPos({
      x: randomX,
      y: randomY,
      isFixed: true
    });
  };

  // Rain of falling hearts
  const triggerHeartShower = () => {
    const emojis = ['❤️', '💖', '💝', '💕', '💘', '💗', '✨', '🌸', '🌹'];
    const particles: HeartParticle[] = [];
    
    for (let i = 0; i < 70; i++) {
      particles.push({
        id: i,
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        left: `${Math.random() * 100}vw`,
        scale: 0.5 + Math.random() * 1.5,
        duration: 3 + Math.random() * 3,
        opacity: 0.6 + Math.random() * 0.4,
      });
    }
    
    setHeartParticles(particles);
  };

  const handleYesClick = () => {
    const nextVideoSrc = celebrationVideoSrc === celebrationVideoSources[0]
      ? celebrationVideoSources[1]
      : celebrationVideoSources[0];

    setVideoError(false);
    setCelebrationVideoSrc(nextVideoSrc);
    setStep('celebration');
    triggerHeartShower();

    if (videoRef.current) {
      const video = videoRef.current;
      video.src = nextVideoSrc;
      video.muted = false;
      video.currentTime = 0;
    }
  };

  // Planning Form Submission
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const finalPlace = customPlace.trim() !== '' ? customPlace.trim() : selectedPlace;
    
    // Format Date string to DD/MM/YYYY
    let formattedDate = formDate;
    if (formDate) {
      const parts = formDate.split('-');
      if (parts.length === 3) {
        formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }

    const responseId = `resp_${Date.now()}`;
    const timestampStr = new Date().toLocaleString('pt-BR');

    const newResponse: DateResponse = {
      id: responseId,
      place: finalPlace,
      date: formattedDate,
      time: formTime || '20:00',
      rawDate: formDate,
      timestamp: timestampStr,
      status: 'active'
    };

    // Save to Firestore
    try {
      await setDoc(doc(db, 'respostas', responseId), {
        id: responseId,
        nome: '',
        lugar: finalPlace,
        data: formattedDate,
        hora: formTime || '20:00',
        status: 'ativo',
        rawDate: formDate,
        timestamp: timestampStr,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `respostas/${responseId}`);
    }

    setLastSubmitted(newResponse);
    setStep('thankyou');
    triggerHeartShower();
  };

  // ADMIN OPERATIONS
  const handleMoveToTrash = async (id: string) => {
    try {
      await updateDoc(doc(db, 'respostas', id), {
        status: 'lixeira',
        atualizadoEm: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `respostas/${id}`);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await updateDoc(doc(db, 'respostas', id), {
        status: 'ativo',
        atualizadoEm: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `respostas/${id}`);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'respostas', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `respostas/${id}`);
    }
  };

  // Inline editing in admin dashboard
  const startInlineEdit = (item: DateResponse) => {
    setEditingId(item.id);
    setEditPlace(item.place);
    setEditDate(item.rawDate);
    setEditTime(item.time);
    setEditError(null);
  };

  const cancelInlineEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const saveInlineEdit = async (id: string) => {
    if (!editPlace.trim() || !editDate || !editTime) {
      setEditError('Por favor, preencha todos os campos!');
      return;
    }

    const dateParts = editDate.split('-');
    const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

    try {
      await updateDoc(doc(db, 'respostas', id), {
        lugar: editPlace.trim(),
        rawDate: editDate,
        data: formattedDate,
        hora: editTime,
        atualizadoEm: serverTimestamp()
      });
      setEditingId(null);
      setEditError(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `respostas/${id}`);
    }
  };

  // Place presets
  const presets = [
    { name: 'Jantar Romântico', icon: '🍝', label: 'Jantar' },
    { name: 'Cafeteria Aconchegante', icon: '☕', label: 'Café' },
    { name: 'Cinema & Pipoca', icon: '🍿', label: 'Cinema' },
    { name: 'Passeio no Parque', icon: '🧺', label: 'Passeio' },
  ];

  return (
    <div id="app-container" className="min-h-screen bg-[#ffe6ea] flex flex-col items-center justify-between p-4 overflow-hidden relative selection:bg-[#ff4d6d]/20">
      


      {/* Decorative floating screen elements - Immersive UI */}
      <div className="absolute inset-0 pointer-events-none z-0 select-none">
        <div className="absolute top-10 left-10 text-5xl animate-bounce" style={{ animationDuration: '6s' }}>🌸</div>
        <div className="absolute bottom-20 right-20 text-6xl animate-bounce" style={{ animationDuration: '5s' }}>💖</div>
        <div className="absolute top-1/4 right-10 text-4xl animate-pulse">✨</div>
        <div className="absolute bottom-1/4 left-10 text-5xl animate-bounce" style={{ animationDuration: '7s' }}>🌷</div>
      </div>

      {/* Interactive Main Card */}
      <div className={`flex-1 flex items-center justify-center z-10 w-full my-8 transition-all duration-500 ${step === 'celebration' ? 'max-w-4xl px-2 md:px-4' : 'max-w-lg'}`}>
        <motion.div
          id="main-card"
          layout
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100 }}
          className="bg-white/96 backdrop-blur-md border border-white/60 rounded-[2.5rem] p-8 md:p-12 shadow-[0_25px_50px_-12px_rgba(255,77,109,0.25)] text-center w-full relative"
        >
          <AnimatePresence mode="wait">
            
            {/* STAGE 1: THE PROPOSAL */}
            {step === 'proposal' && (
              <motion.div
                key="proposal"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center"
              >
                <div className="mb-6 text-7xl select-none">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                  >
                    💌
                  </motion.div>
                </div>
                
                <h1 className="text-[#590d22] text-3xl md:text-4xl font-extrabold mb-2 tracking-tight">
                  Quer ir em um date comigo? 🥺
                </h1>
                
                <p className="text-[#ff4d6d] mb-10 font-bold text-sm md:text-base">
                  Prometo que vai ser inesquecível! 🌹
                </p>

                <div className="flex justify-center items-center gap-6 min-h-[60px] w-full">
                  <button
                    id="btn-proposal-yes"
                    onClick={handleYesClick}
                    className="px-10 py-3.5 bg-[#ff4d6d] text-white font-bold text-lg rounded-full shadow-[0_10px_15px_-3px_rgba(255,77,109,0.4)] hover:scale-110 hover:bg-[#ff758f] transition duration-200 cursor-pointer"
                  >
                    SIM
                  </button>

                  {noBtnPos.isFixed ? (
                    createPortal(
                      <button
                        id="btn-proposal-no"
                        ref={noBtnRef}
                        onMouseEnter={handleMoveNoButton}
                        onTouchStart={handleMoveNoButton}
                        onPointerDown={handleMoveNoButton}
                        onClick={handleMoveNoButton}
                        style={{
                          position: 'fixed',
                          left: `${noBtnPos.x}px`,
                          top: `${noBtnPos.y}px`,
                          zIndex: 9999,
                        }}
                        className="px-10 py-3.5 bg-[#e2e8f0] text-[#64748b] border border-[#cbd5e1] font-bold text-lg rounded-full cursor-pointer select-none transition-none"
                      >
                        NÃO
                      </button>,
                      document.body
                    )
                  ) : (
                    <button
                      id="btn-proposal-no"
                      ref={noBtnRef}
                      onMouseEnter={handleMoveNoButton}
                      onTouchStart={handleMoveNoButton}
                      onPointerDown={handleMoveNoButton}
                      onClick={handleMoveNoButton}
                      style={{
                        position: 'relative',
                        zIndex: 20
                      }}
                      className="px-10 py-3.5 bg-[#e2e8f0] text-[#64748b] border border-[#cbd5e1] font-bold text-lg rounded-full cursor-pointer select-none transition-none"
                    >
                      NÃO
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* STAGE 3: PLANNING FORM */}
            {step === 'planning' && (
              <motion.div
                key="planning"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center w-full"
              >
                <div className="text-5xl mb-4">📅🗺️</div>
                <h1 className="text-[#590d22] text-2xl md:text-3xl font-extrabold mb-1">O Nosso Encontro</h1>
                <p className="text-[#ff4d6d] text-xs md:text-sm font-semibold mb-8">Personalize os detalhes especiais!</p>

                <form onSubmit={handleFormSubmit} className="w-full text-left space-y-5">
                  <div>
                    <label className="block text-[#590d22] font-bold text-xs uppercase tracking-wider mb-2">
                      Para onde vamos?
                    </label>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {presets.map((item) => (
                        <div
                          key={item.name}
                          onClick={() => {
                            setSelectedPlace(item.name);
                            setCustomPlace('');
                          }}
                          className={`border-2 rounded-2xl p-3 cursor-pointer text-center transition-all duration-200 flex flex-col items-center gap-1.5 ${
                            selectedPlace === item.name && customPlace === ''
                              ? 'border-[#ff4d6d] bg-[#ffe6ea] scale-[1.02] text-[#590d22]'
                              : 'border-[#ffccd5] bg-white hover:border-[#ff4d6d]/50 text-gray-700'
                          }`}
                        >
                          <span className="text-2xl">{item.icon}</span>
                          <span className="font-bold text-xs md:text-sm">{item.label}</span>
                        </div>
                      ))}
                    </div>
                    <input
                      type="text"
                      placeholder="Ou digite outro lugar que gostaria de ir"
                      value={customPlace}
                      onChange={(e) => setCustomPlace(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border-2 border-[#ffccd5] focus:border-[#ff4d6d] outline-none text-sm font-semibold bg-white text-[#590d22] transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[#590d22] font-bold text-xs uppercase tracking-wider mb-2">
                      Melhor Dia
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        required
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full px-4 py-3 rounded-2xl border-2 border-[#ffccd5] focus:border-[#ff4d6d] outline-none text-sm font-semibold bg-white text-[#590d22]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[#590d22] font-bold text-xs uppercase tracking-wider mb-2">
                      Horário Ideal
                    </label>
                    <input
                      type="time"
                      required
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border-2 border-[#ffccd5] focus:border-[#ff4d6d] outline-none text-sm font-semibold bg-white text-[#590d22]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-4 px-6 bg-[#ff4d6d] hover:bg-[#ff1a43] text-white font-extrabold rounded-2xl shadow-md hover:shadow-[#ff4d6d]/30 transition-all duration-200 text-center text-sm uppercase tracking-wider cursor-pointer mt-2"
                  >
                    Finalizar Agendamento ✨
                  </button>
                </form>
              </motion.div>
            )}

            {/* STAGE 4: THANK YOU SCREEN */}
            {step === 'thankyou' && lastSubmitted && (
              <motion.div
                key="thankyou"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center w-full"
              >
                <div className="text-6xl mb-4">💖✨</div>
                <h1 className="text-[#590d22] text-2xl md:text-3xl font-black mb-1">Tudo Confirmado!</h1>
                <p className="text-[#ff4d6d] text-sm font-bold mb-6">Mal posso esperar por esse momento!</p>

                <div className="w-full bg-[#ffe6ea] border-2 border-dashed border-[#ffccd5] rounded-3xl p-5 md:p-6 text-left space-y-3 mb-6">
                  <p className="text-[#ff4d6d] font-extrabold text-[0.7rem] uppercase tracking-widest">Resumo do Date:</p>
                  <p className="font-bold text-[#590d22] text-base flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-[#ff4d6d] shrink-0" />
                    <span>Lugar: {lastSubmitted.place}</span>
                  </p>
                  <p className="font-bold text-[#590d22] text-sm flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-[#ff4d6d] shrink-0" />
                    <span>Data: {lastSubmitted.date}</span>
                  </p>
                  <p className="font-bold text-[#590d22] text-sm flex items-center gap-2">
                    <Clock className="w-5 h-5 text-[#ff4d6d] shrink-0" />
                    <span>Hora: {lastSubmitted.time}</span>
                  </p>
                </div>

                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => {
                      setStep('proposal');
                      setNoBtnPos({ x: 0, y: 0, isFixed: false });
                    }}
                    className="flex-1 py-3 px-4 bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-600 font-bold rounded-xl text-xs cursor-pointer"
                  >
                    Refazer Proposta
                  </button>
                  <button
                    onClick={() => setStep('planning')}
                    className="flex-1 py-3 px-4 bg-[#ff4d6d]/10 hover:bg-[#ff4d6d]/20 text-[#ff4d6d] font-bold rounded-xl text-xs cursor-pointer"
                  >
                    Alterar Detalhes
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>
      </div>

      {/* Standalone Celebration Screen - Fully Viewport Fixed and z-indexed */}
      <AnimatePresence>
        {step === 'celebration' && (
          <motion.div
            key="celebration"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`fixed inset-0 w-screen h-screen z-[9900] flex flex-col justify-between p-6 overflow-hidden select-none transition-all duration-700 ${videoError ? 'bg-gradient-to-tr from-[#1a050d] via-[#4d0b25] to-[#800f3c]' : 'bg-transparent'}`}
          >
            {/* Fullscreen Video Cover */}
            <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none flex items-center justify-center">
              {/* Subtle vignette/overlay to make elements readable and give premium club lighting */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70 mix-blend-multiply" />
              <div className="absolute inset-0 bg-pink-500/10 mix-blend-screen" />
              {videoError && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  {/* Glowing ambient light orbs */}
                  <motion.div
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.15, 0.3, 0.15],
                    }}
                    transition={{
                      duration: 8,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="absolute -top-1/4 -left-1/4 w-[80vw] h-[80vw] rounded-full bg-[#ff4d6d]/25 blur-[120px]"
                  />
                  <motion.div
                    animate={{
                      scale: [1.2, 1, 1.2],
                      opacity: [0.1, 0.25, 0.1],
                    }}
                    transition={{
                      duration: 10,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="absolute -bottom-1/4 -right-1/4 w-[80vw] h-[80vw] rounded-full bg-[#ffccd5]/20 blur-[120px]"
                  />
                </div>
              )}
            </div>

            {/* Floating cinematic texts */}
            <div className="relative z-10 text-center pt-8 md:pt-16 max-w-xl mx-auto flex flex-col items-center">
              <div className="text-7xl md:text-8xl mb-4 select-none animate-bounce" style={{ animationDuration: '2s' }}>
                🎉🥰
              </div>
              <h1 className="text-white text-4xl md:text-6xl font-black mb-3 tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
                Ebaaa! ❤️
              </h1>
              <p className="text-[#ff4d6d] text-lg md:text-2xl font-extrabold tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] uppercase text-center">
                Prepare-se para o melhor date de todos!
              </p>
            </div>

            {/* Elegant Bottom Action Bar */}
            <div className="relative z-10 pb-8 md:pb-16 w-full max-w-md mx-auto">
              <button
                onClick={() => setStep('planning')}
                className="w-full py-4.5 px-8 bg-[#ff4d6d] hover:bg-[#ff1a43] active:scale-95 text-white font-black text-xl rounded-2xl shadow-[0_20px_40px_-5px_rgba(255,77,109,0.5)] hover:shadow-[#ff4d6d]/70 transition-all duration-300 flex items-center justify-center gap-3 cursor-pointer border-2 border-white/40"
              >
                <span>Ir para o Planejamento!</span>
                <HeartHandshake className="w-6 h-6 animate-pulse text-white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating particles of hearts for React Success Screen */}
      {step !== 'proposal' && (
        <div id="particles-overlay" className="fixed inset-0 pointer-events-none z-[1100] select-none">
          {heartParticles.map((particle) => (
            <motion.div
              key={particle.id}
              initial={{ y: -50, x: 0, opacity: 0 }}
              animate={{ 
                y: '110vh',
                opacity: [0, particle.opacity, particle.opacity, 0]
              }}
              transition={{ 
                duration: particle.duration, 
                ease: "linear",
                times: [0, 0.1, 0.9, 1]
              }}
              style={{
                position: 'absolute',
                left: particle.left,
                fontSize: `${particle.scale * 1.5}rem`,
              }}
            >
              {particle.emoji}
            </motion.div>
          ))}
        </div>
      )}

      {/* Elegant minimalist footer with tips */}
      <div id="app-footer" className="w-full text-center pb-3 pt-6 z-10">
      </div>

      {/* SECRET ADMIN PANEL MODAL */}
      <AnimatePresence>
        {showAdmin && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border-2 border-[#ffccd5]"
            >
              <div className="bg-[#ffe6ea] p-5 border-b border-[#ffccd5] flex justify-between items-center shrink-0">
                <h3 className="font-extrabold text-[#590d22] text-lg md:text-xl flex items-center gap-2">
                  <span>⚙️ Painel do Cupido (Admin)</span>
                </h3>
                <button
                  onClick={() => setShowAdmin(false)}
                  className="p-1.5 hover:bg-[#ffccd5]/50 rounded-xl text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-100 bg-gray-50 shrink-0">
                <button
                  onClick={() => setAdminTab('active')}
                  className={`flex-1 py-3.5 text-center font-bold text-sm transition-all border-b-3 ${
                    adminTab === 'active'
                      ? 'text-[#ff4d6d] border-[#ff4d6d] bg-white'
                      : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}
                >
                  Respostas Ativas ({responses.filter(r => r.status !== 'trash').length})
                </button>
                <button
                  onClick={() => setAdminTab('trash')}
                  className={`flex-1 py-3.5 text-center font-bold text-sm transition-all border-b-3 ${
                    adminTab === 'trash'
                      ? 'text-[#ff4d6d] border-[#ff4d6d] bg-white'
                      : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}
                >
                  Lixeira ({responses.filter(r => r.status === 'trash').length})
                </button>
              </div>

              {/* Scrollable List Container */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {responses.filter(item => adminTab === 'active' ? item.status !== 'trash' : item.status === 'trash').length === 0 ? (
                  <div className="text-center py-12 text-gray-400 font-semibold">
                    <p className="text-4xl mb-3">🧸</p>
                    <p className="text-sm">
                      {adminTab === 'active' 
                        ? 'Nenhuma resposta registrada ainda.' 
                        : 'A lixeira está vazia.'}
                    </p>
                  </div>
                ) : (
                  responses
                    .filter(item => adminTab === 'active' ? item.status !== 'trash' : item.status === 'trash')
                    .map((item) => (
                      <div
                        key={item.id}
                        className="bg-gray-50 border border-gray-200 rounded-2xl p-4 md:p-5 text-left relative hover:border-[#ffccd5] transition-all"
                      >
                        {editingId === item.id ? (
                          <div className="space-y-3">
                            <div className="flex justify-between items-center text-xs text-gray-500 pb-2 border-b border-dashed border-gray-200">
                              <span className="font-mono">ID: {item.id}</span>
                              <span className="text-[#ff4d6d] font-bold uppercase tracking-wider">Editando Resposta</span>
                            </div>
                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Lugar:</label>
                                <input
                                  type="text"
                                  value={editPlace}
                                  onChange={(e) => setEditPlace(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:border-[#ff4d6d] outline-none text-sm font-semibold"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Data:</label>
                                <input
                                  type="date"
                                  value={editDate}
                                  onChange={(e) => setEditDate(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:border-[#ff4d6d] outline-none text-sm font-semibold"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Hora:</label>
                                <input
                                  type="time"
                                  value={editTime}
                                  onChange={(e) => setEditTime(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:border-[#ff4d6d] outline-none text-sm font-semibold"
                                />
                              </div>
                            </div>
                            {editError && (
                              <p className="text-rose-600 text-xs font-extrabold bg-rose-50 border border-rose-100 px-3 py-2 rounded-xl text-center">
                                {editError}
                              </p>
                            )}
                            <div className="flex gap-2 justify-end pt-2">
                              <button
                                onClick={cancelInlineEdit}
                                className="px-3.5 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-full text-xs cursor-pointer"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => saveInlineEdit(item.id)}
                                className="px-3.5 py-1.5 bg-[#ff4d6d] hover:bg-[#ff1a43] text-white font-bold rounded-full text-xs cursor-pointer"
                              >
                                Salvar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex justify-between items-center text-xs text-gray-400 pb-2 border-b border-dashed border-gray-200 mb-3">
                              <span className="font-mono">ID: {item.id}</span>
                              <span className="font-semibold text-[#ff4d6d]">{item.timestamp}</span>
                            </div>
                            <div className="space-y-1.5">
                              <p className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                                <span className="text-gray-400">📍 Lugar:</span>
                                <strong className="text-[#590d22]">{item.place}</strong>
                              </p>
                              <p className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                                <span className="text-gray-400">📅 Data:</span>
                                <strong className="text-[#590d22]">{item.date}</strong>
                              </p>
                              <p className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                                <span className="text-gray-400">⏰ Hora:</span>
                                <strong className="text-[#590d22]">{item.time}</strong>
                              </p>
                            </div>
 
                            {/* Response Actions */}
                            <div className="flex gap-2 justify-end mt-4 pt-3 border-t border-gray-100 items-center">
                              {adminTab === 'active' ? (
                                <>
                                  <button
                                    onClick={() => startInlineEdit(item)}
                                    className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-full text-xs cursor-pointer flex items-center gap-1"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Editar</span>
                                  </button>
                                  <button
                                    onClick={() => handleMoveToTrash(item.id)}
                                    className="px-3.5 py-1.5 bg-[#ffe6ea] hover:bg-[#ffccd5] text-[#ff4d6d] font-bold rounded-full text-xs cursor-pointer flex items-center gap-1"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Excluir</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleRestore(item.id)}
                                    className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-full text-xs cursor-pointer flex items-center gap-1"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Restaurar</span>
                                  </button>
                                  {deleteConfirmId === item.id ? (
                                    <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-full text-xs">
                                      <span className="text-[10px] text-rose-600 font-extrabold uppercase tracking-wide">Certeza?</span>
                                      <button
                                        onClick={() => {
                                          handlePermanentDelete(item.id);
                                          setDeleteConfirmId(null);
                                        }}
                                        className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-full text-[9px] uppercase cursor-pointer"
                                      >
                                        Sim
                                      </button>
                                      <button
                                        onClick={() => setDeleteConfirmId(null)}
                                        className="px-2 py-0.5 bg-gray-200 hover:bg-gray-300 text-gray-600 font-extrabold rounded-full text-[9px] uppercase cursor-pointer"
                                      >
                                        Não
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setDeleteConfirmId(item.id)}
                                      className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-full text-xs cursor-pointer flex items-center gap-1"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      <span>Excluir Permanentemente</span>
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Background Celebration Video - Kept in DOM to allow preloading and synchronous activation */}
      <video
        key={celebrationVideoSrc}
        ref={videoRef}
        id="celebration-background-video"
        className={`fixed inset-0 w-screen h-screen object-cover pointer-events-none transition-opacity duration-1000 bg-black ${
          step === 'celebration' && !videoError ? 'opacity-100 z-[9800]' : 'opacity-0 -z-50'
        }`}
        src={celebrationVideoSrc}
        autoPlay
        loop
        playsInline
        preload="auto"
        style={{
          width: '100vw',
          height: '100vh',
        }}
        onError={(e) => {
          const video = e.currentTarget;
          const fallbackSrc = celebrationVideoSrc === celebrationVideoSources[0]
            ? celebrationVideoSources[1]
            : celebrationVideoSources[0];

          if (fallbackSrc && video.currentSrc !== fallbackSrc) {
            video.src = fallbackSrc;
            video.muted = true;
            video.load();
            video.play().catch(() => {
              setVideoError(true);
            });
            return;
          }

          console.warn("Video failed to load or has unsupported sources, switching to elegant fallback background.", e);
          setVideoError(true);
        }}
      />

    </div>
  );
}
