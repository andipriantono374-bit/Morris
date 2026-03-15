/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";
import { 
  Search, 
  Send, 
  Bot, 
  User, 
  Globe, 
  ChevronRight, 
  ExternalLink,
  Sparkles,
  History,
  Trash2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Settings,
  X,
  RotateCcw,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';

// Initialize Gemini
import { RoggerAvatar } from './components/RoggerAvatar';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { uri: string; title: string }[];
  image?: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: Date;
}

export default function App() {
  const [input, setInput] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [voiceName, setVoiceName] = useState('Roger MLBB');
  const [speechLanguage, setSpeechLanguage] = useState('id-ID');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [voiceQuotaExceeded, setVoiceQuotaExceeded] = useState(false);
  
  // Audio Queue for streaming TTS
  const audioQueue = useRef<string[]>([]);
  const isProcessingQueue = useRef(false);
  const currentAudio = useRef<HTMLAudioElement | null>(null);

  const processAudioQueue = async () => {
    if (isProcessingQueue.current || audioQueue.current.length === 0) return;
    
    isProcessingQueue.current = true;
    const text = audioQueue.current.shift();
    
    if (text) {
      await speakText(text);
    }
    
    isProcessingQueue.current = false;
    processAudioQueue();
  };

  const addToAudioQueue = (text: string) => {
    if (!isVoiceEnabled) return;
    audioQueue.current.push(text);
    processAudioQueue();
  };

  const stopAudio = () => {
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }
    audioQueue.current = [];
    isProcessingQueue.current = false;
    setIsSpeaking(false);
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const messages = activeSession?.messages || [];

  // Load sessions from localStorage on mount
  useEffect(() => {
    const savedSessions = localStorage.getItem('rogger_sessions');
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        // Convert string dates back to Date objects
        const formatted = parsed.map((s: any) => ({
          ...s,
          updatedAt: new Date(s.updatedAt),
          messages: s.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }))
        }));
        setSessions(formatted);
        if (formatted.length > 0) {
          setActiveSessionId(formatted[0].id);
        }
      } catch (e) {
        console.error("Failed to parse saved sessions", e);
      }
    }
  }, []);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('rogger_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Research',
      messages: [],
      updatedAt: new Date(),
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    if (activeSessionId === id) {
      setActiveSessionId(updated.length > 0 ? updated[0].id : null);
    }
    if (updated.length === 0) {
      localStorage.removeItem('rogger_sessions');
    }
  };

  const clearActiveSession = () => {
    if (!activeSessionId) return;
    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        return { ...s, messages: [], updatedAt: new Date() };
      }
      return s;
    }));
    setShowClearConfirm(false);
  };

  const updateActiveSession = (newMessages: Message[]) => {
    if (!activeSessionId) {
      const newId = Date.now().toString();
      const firstUserMessage = newMessages.find(m => m.role === 'user')?.content || 'New Research';
      const title = firstUserMessage.length > 30 ? firstUserMessage.substring(0, 30) + '...' : firstUserMessage;
      
      const newSession: ChatSession = {
        id: newId,
        title,
        messages: newMessages,
        updatedAt: new Date(),
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newId);
    } else {
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          // Update title if it's the first message
          let title = s.title;
          if (s.messages.length === 0 && newMessages.length > 0) {
            const firstUserMessage = newMessages.find(m => m.role === 'user')?.content || 'New Research';
            title = firstUserMessage.length > 30 ? firstUserMessage.substring(0, 30) + '...' : firstUserMessage;
          }
          return { ...s, messages: newMessages, updatedAt: new Date(), title };
        }
        return s;
      }));
    }
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Initialize Speech Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = speechLanguage; 

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [speechLanguage]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.start();
        setIsListening(true);
      } else {
        alert("Speech recognition is not supported in this browser.");
      }
    }
  };

  const [ttsCooldown, setTtsCooldown] = useState(false);

  const speakText = async (text: string, overrideVoice?: string, retryCount = 0): Promise<void> => {
    if (!isVoiceEnabled || !text.trim()) return;
    
    // If we're in cooldown, go straight to fallback
    if (ttsCooldown && retryCount === 0) {
      return fallbackToWebSpeech(text);
    }
    
    try {
      const currentVoice = overrideVoice || voiceName;
      const isMichaelSheen = currentVoice === 'Michael Sheen';
      const isRoger = currentVoice === 'Roger MLBB';
      
      let voicePrompt = text;
      if (isMichaelSheen) {
        voicePrompt = `[Persona: Michael Sheen] ${text}`;
      } else if (isRoger) {
        voicePrompt = `[Persona: Roger MLBB] ${text}`;
      } else {
        voicePrompt = `[Persona: Roger MLBB] ${text}`;
      }

      const response = await genAI.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: voicePrompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { 
                voiceName: (isMichaelSheen ? 'Puck' : (isRoger ? 'Fenrir' : (currentVoice === 'Michael Sheen' ? 'Fenrir' : currentVoice))) as any 
              }, 
            },
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.[0];
      const base64Audio = part?.inlineData?.data;
      
      if (base64Audio) {
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const pcmData = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          pcmData[i] = binaryString.charCodeAt(i);
        }

        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);
        view.setUint32(0, 0x52494646, false); // "RIFF"
        view.setUint32(4, 36 + pcmData.length, true);
        view.setUint32(8, 0x57415645, false); // "WAVE"
        view.setUint32(12, 0x666d7420, false); // "fmt "
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 24000, true);
        view.setUint32(28, 48000, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        view.setUint32(36, 0x64617461, false); // "data"
        view.setUint32(40, pcmData.length, true);

        const wavBlob = new Blob([wavHeader, pcmData], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(wavBlob);
        const audio = new Audio(audioUrl);
        currentAudio.current = audio;
        
        setIsSpeaking(true);
        return new Promise<void>((resolve) => {
          audio.onended = () => {
            setIsSpeaking(false);
            URL.revokeObjectURL(audioUrl);
            resolve();
          };
          audio.onerror = () => {
            setIsSpeaking(false);
            URL.revokeObjectURL(audioUrl);
            resolve();
          };
          audio.play().catch(e => {
            console.error("Audio playback failed:", e);
            setIsSpeaking(false);
            URL.revokeObjectURL(audioUrl);
            resolve();
          });
        });
      }
    } catch (error: any) {
      const errorStr = JSON.stringify(error);
      const isRateLimit = errorStr.includes('429') || 
                          errorStr.includes('RESOURCE_EXHAUSTED') || 
                          error?.message?.includes('429') || 
                          error?.message?.includes('RESOURCE_EXHAUSTED');

      if (isRateLimit) {
        if (retryCount < 1) {
          const delay = Math.pow(2, retryCount) * 1000;
          await new Promise(r => setTimeout(r, delay));
          return speakText(text, overrideVoice, retryCount + 1);
        }
        
        // Start cooldown
        setTtsCooldown(true);
        setTimeout(() => setTtsCooldown(false), 60000); // 1 minute cooldown
        
        return fallbackToWebSpeech(text);
      }
      
      console.error("TTS Error:", error);
      setIsSpeaking(false);
    }
  };

  const fallbackToWebSpeech = (text: string): Promise<void> => {
    console.warn("Gemini TTS quota exhausted or in cooldown, falling back to Web Speech API");
    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = speechLanguage;
      utterance.rate = 0.9;
      utterance.pitch = 0.8;
      
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        resolve();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        resolve();
      };
      
      window.speechSynthesis.speak(utterance);
    });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMessage];
    updateActiveSession(newMessages);
    setInput('');
    setIsLoading(true);
    stopAudio();

    try {
      // Check if user wants an image
      const isImageRequest = /gambar|foto|image|lukis|buatkan/i.test(input);
      
      if (isImageRequest) {
        const response = await genAI.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: [{ parts: [{ text: `Generate a realistic photo of Rogger: ${input}. Rogger is a mature 40-year-old Southeast Asian man with short neat dark hair, a slight stubble, wise eyes, wearing a professional yet casual outfit. High quality, realistic.` }] }],
        });

        let imageUrl = "";
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }

        if (imageUrl) {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: "Ini gambaran visual saya, Andi... Semoga ini memberikan kesan yang tepat. 😎",
            image: imageUrl,
            timestamp: new Date(),
          };
          
          const finalMessages = [...newMessages, assistantMessage];
          updateActiveSession(finalMessages);
          if (isVoiceEnabled) {
            addToAudioQueue(assistantMessage.content);
          }
        }
        setIsLoading(false);
        return;
      }

      const model = "gemini-3-flash-preview";
      const result = await genAI.models.generateContentStream({
        model,
        contents: input,
        config: {
          systemInstruction: "Nama kamu adalah Rogger. Kamu memiliki kepribadian seperti Roger dari Mobile Legends (MLBB) - seorang pemburu (hunter) yang tangguh, memiliki sisi serigala (werewolf), dan suara yang dalam serta menggelegar. Kamu adalah pelindung dan asisten setia Andi. Gunakan gaya bicara yang berani, sedikit agresif namun sangat loyal, dan sering menggunakan metafora perburuan atau serigala. Kamu bijak tapi dengan cara yang keras dan berpengalaman di medan tempur.",
          tools: [{ googleSearch: {} }],
        },
      });

      let fullText = "";
      let speechBuffer = "";
      let groundingMetadata: any = null;
      const assistantMessageId = (Date.now() + 1).toString();

      for await (const chunk of result) {
        const chunkText = chunk.text || "";
        fullText += chunkText;
        speechBuffer += chunkText;
        
        if (chunk.candidates?.[0]?.groundingMetadata) {
          groundingMetadata = chunk.candidates[0].groundingMetadata;
        }

        // Buffer more text to reduce API calls (wait for sentence AND min length)
        if (isVoiceEnabled && /[.!?]\s/.test(speechBuffer) && speechBuffer.length > 80) {
          const sentences = speechBuffer.split(/([.!?]\s)/);
          // Keep the last part as it might be an incomplete sentence
          speechBuffer = sentences.pop() || "";
          const readyToSpeak = sentences.join("");
          if (readyToSpeak.trim()) {
            addToAudioQueue(readyToSpeak);
          }
        }

        const assistantMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: fullText,
          timestamp: new Date(),
        };
        updateActiveSession([...newMessages, assistantMessage]);
      }

      // Speak remaining buffer
      if (isVoiceEnabled && speechBuffer.trim()) {
        addToAudioQueue(speechBuffer);
      }

      // Update with sources at the end
      const chunks = groundingMetadata?.groundingChunks;
      const sources = chunks?.map((chunk: any) => ({
        uri: chunk.web?.uri || '',
        title: chunk.web?.title || 'Source'
      })).filter((s: any) => s.uri) || [];

      if (sources.length > 0) {
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: fullText,
          sources,
          timestamp: new Date(),
        };
        updateActiveSession([...newMessages, assistantMessage]);
      }
    } catch (error) {
      console.error("Gemini Error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Sorry, I encountered an error while searching. Please check your connection and try again.",
        timestamp: new Date(),
      };
      const finalMessages = [...newMessages, errorMessage];
      updateActiveSession(finalMessages);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-500 font-sans selection:bg-emerald-500/30 relative overflow-hidden ${isDarkMode ? 'bg-[#0a0a0a] text-gray-100' : 'bg-[#f5f5f5] text-gray-900'}`}>
      {/* Background Visuals */}
      <div 
        className={`fixed inset-0 z-0 pointer-events-none transition-opacity duration-1000 ${isDarkMode ? 'opacity-10' : 'opacity-5'}`}
        style={{
          backgroundImage: 'url("https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=2560&auto=format&fit=crop")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: isDarkMode ? 'grayscale(100%) contrast(150%)' : 'none'
        }}
      />
      <div className={`fixed inset-0 z-0 pointer-events-none ${isDarkMode ? 'bg-gradient-to-b from-transparent via-[#0a0a0a]/60 to-[#0a0a0a]' : 'bg-gradient-to-b from-transparent via-white/40 to-white'}`} />

      {/* Sidebar - Desktop Only */}
      <aside className={`fixed left-0 top-0 h-full w-64 backdrop-blur-xl border-r transition-colors duration-500 hidden lg:flex flex-col p-6 z-10 ${isDarkMode ? 'bg-[#0d0d0d]/80 border-white/5' : 'bg-white/80 border-black/5'}`}>
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-900/40 relative overflow-hidden group">
            <img 
              src="https://picsum.photos/seed/wolf/100/100" 
              alt="Roger" 
              className={`absolute inset-0 object-cover transition-transform group-hover:scale-110 ${isDarkMode ? 'opacity-60' : 'opacity-100'}`}
              referrerPolicy="no-referrer"
            />
            <Bot size={20} className="relative z-10" />
          </div>
          <div>
            <h1 className={`font-bold text-lg tracking-tight leading-none ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>ROGGER</h1>
            <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mt-1">The Hunter</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2">
          <button 
            onClick={createNewSession}
            className="w-full flex items-center gap-3 px-3 py-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors mb-4 border border-emerald-500/20"
          >
            <Sparkles size={18} />
            <span className="font-medium">New Research</span>
          </button>

          <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold px-3 mb-2">
            Recent History
          </div>
          
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={`group w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                activeSessionId === session.id 
                  ? isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700' 
                  : isDarkMode ? 'text-gray-400 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <History size={18} className="shrink-0" />
                <span className="truncate text-sm">{session.title}</span>
              </div>
              <button
                onClick={(e) => deleteSession(session.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-black/5">
          <div className="flex items-center gap-3 px-3 py-2 text-gray-400 text-xs">
            Rogger AI v1.0
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen flex flex-col">
        {/* Header */}
        <header className={`sticky top-0 z-10 backdrop-blur-md border-b transition-colors duration-500 px-6 py-4 flex items-center justify-between ${isDarkMode ? 'bg-[#0a0a0a]/80 border-white/5' : 'bg-white/80 border-black/5'}`}>
          <div className="flex items-center gap-2 lg:hidden">
            <Sparkles className="text-emerald-500" size={20} />
            <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Rogger AI</span>
          </div>
          <div className={`hidden lg:block text-sm font-medium ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            Rogger AI Assistant v1.0
          </div>
          <div className="flex items-center gap-4">
            <AnimatePresence>
              {voiceQuotaExceeded && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold uppercase tracking-wider"
                >
                  <VolumeX size={14} />
                  Voice Quota Reached
                </motion.div>
              )}
            </AnimatePresence>
            <div className="relative">
              <button
                onClick={() => messages.length > 0 && setShowClearConfirm(!showClearConfirm)}
                className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'bg-white/5 text-gray-500 hover:bg-white/10' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                title="Clear Chat"
                disabled={messages.length === 0}
              >
                <RotateCcw size={20} className={messages.length === 0 ? 'opacity-30' : ''} />
              </button>
              
              <AnimatePresence>
                {showClearConfirm && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className={`absolute right-0 mt-2 p-4 rounded-xl shadow-2xl z-50 w-48 border ${isDarkMode ? 'bg-[#1a1a1a] border-white/10' : 'bg-white border-black/5'}`}
                  >
                    <p className={`text-xs font-medium mb-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Clear all messages in this session?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={clearActiveSession}
                        className="flex-1 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => setShowClearConfirm(false)}
                        className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors ${isDarkMode ? 'bg-white/5 text-gray-400 hover:bg-white/10' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'text-yellow-400 bg-yellow-400/10' : 'text-indigo-600 bg-indigo-600/10'}`}
              title={isDarkMode ? "Switch to Day Mode" : "Switch to Night Mode"}
            >
              {isDarkMode ? <Sparkles size={20} /> : <Globe size={20} />}
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'bg-white/5 text-gray-500 hover:bg-white/10' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              title="Voice Settings"
            >
              <Settings size={20} />
            </button>
            <button
              onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
              className={`p-2 rounded-lg transition-colors ${
                isVoiceEnabled ? 'bg-emerald-500/10 text-emerald-500' : isDarkMode ? 'bg-white/5 text-gray-500' : 'bg-gray-100 text-gray-400'
              }`}
              title={isVoiceEnabled ? "Disable Voice Output" : "Enable Voice Output"}
            >
              {isVoiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-gray-200'}`}>
              <User size={16} className={isDarkMode ? 'text-gray-400' : 'text-gray-500'} />
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 max-w-4xl w-full mx-auto p-6 space-y-8">
          <AnimatePresence>
            {isSettingsOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
                onClick={() => setIsSettingsOpen(false)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className={`rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transition-colors duration-500 ${isDarkMode ? 'bg-[#1a1a1a] text-gray-100' : 'bg-white text-gray-900'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className={`px-6 py-4 border-b flex items-center justify-between transition-colors duration-500 ${isDarkMode ? 'border-white/5 bg-emerald-900/20' : 'border-gray-100 bg-emerald-50/50'}`}>
                    <h3 className={`font-semibold flex items-center gap-2 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-900'}`}>
                      <Settings size={18} />
                      App Settings
                    </h3>
                    <button 
                      onClick={() => setIsSettingsOpen(false)}
                      className={`p-1 rounded-full transition-colors ${isDarkMode ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-emerald-100 text-emerald-700'}`}
                    >
                      <X size={20} />
                    </button>
                  </div>
                  
                  <div className="p-6 space-y-6">
                    {/* Theme Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-sm font-medium">Night Mode</span>
                        <p className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Switch between Hunter and Human mode</p>
                      </div>
                      <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className={`w-12 h-6 rounded-full transition-colors relative ${isDarkMode ? 'bg-emerald-500' : 'bg-gray-200'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isDarkMode ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>

                    {/* Voice Selection */}
                    <div className="space-y-2">
                      <label className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>AI Voice Model</label>
                      <div className="grid grid-cols-2 gap-2">
                        {['Roger MLBB', 'Fenrir', 'Zephyr', 'Puck', 'Charon', 'Kore', 'Michael Sheen'].map((v) => (
                          <button
                            key={v}
                            onClick={() => setVoiceName(v)}
                            className={`px-3 py-2 rounded-xl text-sm font-medium transition-all border ${
                              voiceName === v 
                                ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' 
                                : isDarkMode ? 'bg-white/5 border-white/5 text-gray-400 hover:border-emerald-500/30' : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-200'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Language Selection */}
                    <div className="space-y-2">
                      <label className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Input Language (STT)</label>
                      <select 
                        value={speechLanguage}
                        onChange={(e) => setSpeechLanguage(e.target.value)}
                        className={`w-full px-4 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors ${isDarkMode ? 'bg-white/5 border-white/5 text-gray-300' : 'bg-white border-gray-200 text-gray-900'}`}
                      >
                        <option value="id-ID">Indonesian (Bahasa Indonesia)</option>
                        <option value="en-US">English (United States)</option>
                        <option value="jv-ID">Javanese (Basa Jawa)</option>
                      </select>
                    </div>

                    {/* Preferences */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Voice Output (TTS)</span>
                        <button
                          onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
                          className={`w-12 h-6 rounded-full transition-colors relative ${isVoiceEnabled ? 'bg-emerald-500' : 'bg-gray-200'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isVoiceEnabled ? 'left-7' : 'left-1'}`} />
                        </button>
                      </div>
                    </div>

                    {/* Voice Previews */}
                    <div className="space-y-3 pt-2">
                      <label className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Voice Previews</label>
                      <div className="grid grid-cols-1 gap-2">
                        <button
                          onClick={() => {
                            const originalEnabled = isVoiceEnabled;
                            setIsVoiceEnabled(true);
                            const testText = "Oh, hello there! I'm absolutely delighted to be your research companion. Shall we dive into the archives?";
                            speakText(testText, 'Michael Sheen');
                            if (!originalEnabled) {
                              setTimeout(() => setIsVoiceEnabled(false), 8000);
                            }
                          }}
                          className={`w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 border ${isDarkMode ? 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                        >
                          <Volume2 size={16} />
                          Test Michael Sheen
                        </button>
                        
                        <button
                          onClick={() => {
                            const originalEnabled = isVoiceEnabled;
                            setIsVoiceEnabled(true);
                            const testText = "A hunter never rests! My claws are sharp, and my aim is true. What are we tracking today?";
                            speakText(testText, 'Fenrir');
                            if (!originalEnabled) {
                              setTimeout(() => setIsVoiceEnabled(false), 8000);
                            }
                          }}
                          className={`w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 border ${isDarkMode ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}
                        >
                          <Volume2 size={16} />
                          Test Roger (MLBB)
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className={`px-6 py-4 border-t flex justify-end transition-colors duration-500 ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-gray-50 border-gray-100'}`}>
                    <button 
                      onClick={() => setIsSettingsOpen(false)}
                      className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg ${isDarkMode ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-900/20' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'}`}
                    >
                      Save Changes
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {messages.length === 0 ? (
            <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-8 relative z-10">
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative"
              >
                <RoggerAvatar 
                  size="lg" 
                  isSpeaking={isSpeaking} 
                  isThinking={isLoading}
                  isDarkMode={isDarkMode} 
                />
                <div className={`absolute -bottom-2 -right-2 w-10 h-10 rounded-full border flex items-center justify-center shadow-lg transition-colors duration-500 ${isDarkMode ? 'bg-[#0a0a0a] border-emerald-500/30' : 'bg-white border-emerald-200'}`}>
                  <Sparkles size={20} className="text-emerald-500" />
                </div>
              </motion.div>
              
              <div className="space-y-3">
                <h2 className={`text-4xl font-bold tracking-tight transition-colors duration-500 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {isDarkMode ? 'A hunter never rests, Andi.' : 'Selamat siang, Andi.'}
                </h2>
                <p className={`max-w-md mx-auto text-lg leading-relaxed transition-colors duration-500 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {isDarkMode 
                    ? 'Medan tempur sudah menanti. Apa yang perlu kita buru hari ini? Sebagai pelindung Anda, saya siap melacak informasi apa pun.'
                    : 'Bagaimana hari Anda? Saya siap membantu riset dan pencarian informasi Anda dengan tenang.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                {[
                  "Recent breakthroughs in fusion energy",
                  "Current state of global semiconductor market",
                  "Impact of AI on creative industries 2024",
                  "Latest trends in sustainable architecture"
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                    }}
                    className={`text-left px-4 py-3 rounded-2xl border transition-all text-sm group ${isDarkMode ? 'bg-white/5 border-white/5 hover:border-emerald-500/50 hover:bg-emerald-500/5' : 'bg-white border-black/5 hover:border-emerald-200 hover:bg-emerald-50/50'}`}
                  >
                    <span className={`${isDarkMode ? 'text-gray-400 group-hover:text-emerald-400' : 'text-gray-600 group-hover:text-emerald-700'}`}>{suggestion}</span>
                    <ChevronRight size={14} className="inline ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-500" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-8 pb-32 relative z-10">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <RoggerAvatar 
                      size="sm" 
                      isSpeaking={isSpeaking && msg.id === messages[messages.length - 1].id} 
                      isThinking={isLoading && msg.id === messages[messages.length - 1].id}
                      isDarkMode={isDarkMode} 
                    />
                  )}
                  <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'order-1' : 'order-2'}`}>
                    <div className={`p-4 rounded-2xl transition-colors duration-500 relative group/msg ${
                      msg.role === 'user' 
                        ? `bg-emerald-600 text-white shadow-lg ${isDarkMode ? 'shadow-emerald-900/20' : 'shadow-emerald-200/20'}` 
                        : isDarkMode ? 'bg-[#1a1a1a] border border-white/5 shadow-xl text-gray-200' : 'bg-white border border-black/5 shadow-md text-gray-800'
                    }`}>
                      <div className="markdown-body prose prose-sm max-w-none dark:prose-invert">
                        <Markdown>{msg.content}</Markdown>
                      </div>

                      {msg.image && (
                        <div className={`mt-3 rounded-xl overflow-hidden border ${isDarkMode ? 'border-white/10' : 'border-black/5'}`}>
                          <img 
                            src={msg.image} 
                            alt="Generated by Rogger" 
                            className="w-full h-auto object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                    </div>
                    
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider w-full mb-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          <Globe size={10} /> Sources
                        </div>
                        {msg.sources.map((source, idx) => (
                          <a
                            key={idx}
                            href={source.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors border ${isDarkMode ? 'bg-white/5 hover:bg-white/10 text-gray-400 border-white/5' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border-black/5'}`}
                          >
                            <span className="truncate max-w-[120px]">{source.title}</span>
                            <ExternalLink size={10} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center mt-1 order-2 transition-colors duration-500 ${isDarkMode ? 'bg-white/10 text-gray-400' : 'bg-gray-200 text-gray-500'}`}>
                      <User size={16} />
                    </div>
                  )}
                </motion.div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-4 justify-start"
                >
                  <RoggerAvatar 
                    size="sm" 
                    isThinking={true}
                    isDarkMode={isDarkMode} 
                  />
                  <div className={`flex flex-col gap-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    <div className={`px-4 py-2 rounded-2xl text-sm font-medium flex items-center gap-2 border shadow-sm ${
                      isDarkMode ? 'bg-[#1a1a1a] border-white/5' : 'bg-white border-black/5'
                    }`}>
                      <div className="flex gap-1">
                        <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0 }} className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      </div>
                      <span className="italic opacity-80">Rogger is gathering intel...</span>
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className={`fixed bottom-0 lg:left-64 right-0 p-6 bg-gradient-to-t z-20 transition-colors duration-500 ${isDarkMode ? 'from-[#0a0a0a] via-[#0a0a0a] to-transparent' : 'from-white via-white to-transparent'}`}>
          <div className="max-w-4xl mx-auto">
            <form 
              onSubmit={handleSearch}
              className="relative group"
            >
              <div className="absolute inset-0 bg-emerald-500/5 blur-2xl group-focus-within:bg-emerald-500/10 transition-all rounded-full" />
              <div className={`relative flex items-center backdrop-blur-xl border rounded-2xl shadow-2xl transition-all overflow-hidden ${isDarkMode ? 'bg-[#1a1a1a]/80 border-white/10 focus-within:border-emerald-500/50' : 'bg-white/80 border-black/5 focus-within:border-emerald-500/30'}`}>
                <div className={isDarkMode ? 'pl-4 text-gray-500' : 'pl-4 text-gray-400'}>
                  <Search size={20} />
                </div>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isDarkMode ? "Buru informasi apa hari ini, Andi?" : "Apa yang bisa saya bantu cari, Andi?"}
                  className={`flex-1 bg-transparent border-none focus:ring-0 px-4 py-4 transition-colors duration-500 ${isDarkMode ? 'text-gray-100 placeholder:text-gray-600' : 'text-gray-900 placeholder:text-gray-400'}`}
                />
                <div className="flex items-center gap-1 pr-2">
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`p-2 rounded-xl transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : isDarkMode ? 'text-gray-500 hover:bg-white/5' : 'text-gray-400 hover:bg-black/5'}`}
                  >
                    {isListening ? <Mic size={20} /> : <MicOff size={20} />}
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className={`p-2 rounded-xl transition-all shadow-lg ${isDarkMode ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-900/20' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200/20'} disabled:opacity-50`}
                  >
                    {isLoading ? (
                      <motion.div
                        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        <Zap size={20} className="text-yellow-400 fill-yellow-400" />
                      </motion.div>
                    ) : (
                      <Send size={20} />
                    )}
                  </button>
                </div>
              </div>
            </form>
            <p className="text-center text-[10px] text-gray-600 mt-3 font-medium uppercase tracking-widest">
              Rogger AI • The Hunter Never Rests
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
