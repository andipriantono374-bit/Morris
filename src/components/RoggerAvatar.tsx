import React from 'react';
import { motion } from 'motion/react';
import { Bot } from 'lucide-react';

interface RoggerAvatarProps {
  isSpeaking?: boolean;
  isThinking?: boolean;
  isDarkMode?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const RoggerAvatar: React.FC<RoggerAvatarProps> = ({ 
  isSpeaking = false, 
  isThinking = false,
  isDarkMode = true,
  size = 'md'
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-32 h-32'
  };

  const iconSizes = {
    sm: 16,
    md: 24,
    lg: 56
  };

  const containerRadius = {
    sm: 'rounded-lg',
    md: 'rounded-xl',
    lg: 'rounded-[2.5rem]'
  };

  return (
    <div className={`relative flex-shrink-0 ${sizeClasses[size]} ${containerRadius[size]} flex items-center justify-center overflow-hidden transition-all duration-500 shadow-lg border ${
      isDarkMode 
        ? 'bg-emerald-600/20 text-emerald-500 border-emerald-500/30' 
        : 'bg-emerald-100 text-emerald-600 border-emerald-200'
    }`}>
      {/* Background Image with Persona Shift */}
      <motion.img
        src="https://picsum.photos/seed/rogger/400/400"
        alt="Rogger"
        className={`absolute inset-0 object-cover w-full h-full transition-all duration-700 ${
          isDarkMode ? 'opacity-30 grayscale' : 'opacity-80'
        }`}
        animate={{
          scale: isSpeaking ? 1.2 : 1.05,
          filter: isSpeaking ? 'grayscale(0%)' : (isDarkMode ? 'grayscale(100%)' : 'grayscale(0%)'),
          opacity: isSpeaking ? (isDarkMode ? 0.6 : 1) : (isDarkMode ? 0.3 : 0.8)
        }}
        referrerPolicy="no-referrer"
      />

      {/* Thinking / Loading State */}
      {isThinking && !isSpeaking && (
        <>
          <motion.div
            animate={{
              rotate: 360,
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "linear"
            }}
            className="absolute inset-0 border-2 border-dashed border-emerald-500/50 rounded-full scale-90"
          />
          <motion.div
            animate={{
              opacity: [0.1, 0.3, 0.1],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute inset-0 bg-emerald-500/20 rounded-full"
          />
        </>
      )}

      {/* Speaking Waves */}
      {isSpeaking && (
        <>
          <motion.div
            animate={{
              scale: [1, 1.5, 2],
              opacity: [0.5, 0.2, 0],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeOut"
            }}
            className="absolute inset-0 bg-emerald-500/30 rounded-full"
          />
          <motion.div
            animate={{
              scale: [1, 1.3, 1.6],
              opacity: [0.4, 0.1, 0],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeOut",
              delay: 0.5
            }}
            className="absolute inset-0 bg-emerald-400/20 rounded-full"
          />
        </>
      )}

      {/* Idle Breathing Animation */}
      {!isSpeaking && (
        <motion.div
          animate={{
            scale: [1, 1.05, 1],
            opacity: [0.1, 0.2, 0.1]
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute inset-0 bg-emerald-500/10"
        />
      )}

      {/* Bot Icon with Dynamic Motion */}
      <motion.div
        animate={isSpeaking ? {
          y: [0, -2, 0],
          scale: [1, 1.1, 1]
        } : isThinking ? {
          rotate: [0, 10, -10, 0],
          scale: [1, 1.05, 1]
        } : {
          y: 0,
          scale: 1,
          rotate: 0
        }}
        transition={{
          duration: isSpeaking ? 0.5 : 2,
          repeat: (isSpeaking || isThinking) ? Infinity : 0,
          ease: "easeInOut"
        }}
        className="relative z-10"
      >
        <Bot 
          size={iconSizes[size]} 
          className={`drop-shadow-xl transition-colors duration-500 ${
            isSpeaking 
              ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-700') 
              : (isDarkMode ? 'text-emerald-500' : 'text-emerald-600')
          }`} 
        />
      </motion.div>

      {/* Eye Blinking (Simulated with subtle overlay) */}
      {!isSpeaking && (
        <motion.div
          animate={{
            opacity: [0, 0, 1, 0, 0]
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            times: [0, 0.9, 0.92, 0.94, 1]
          }}
          className="absolute inset-0 bg-black/10 z-20 pointer-events-none"
        />
      )}
    </div>
  );
};
