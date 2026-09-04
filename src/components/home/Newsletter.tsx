import React, { useState } from 'react';
import { Facebook, Instagram, Music2, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { fadeUp, staggerContainer } from '@/lib/animations';

const ScentedFumesNewsletter = () => {
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
  };

  return (
    <section 
      className="w-full flex flex-col items-center justify-center text-center"
      style={{
        paddingTop: "clamp(4rem, 6vh, 6rem)",
        paddingBottom: "clamp(4rem, 6vh, 6rem)",
        paddingLeft: "clamp(2rem, 5vw, 6rem)",
        paddingRight: "clamp(2rem, 5vw, 6rem)",
        background: "var(--gradient-newsletter)",
      }}
    >
      <motion.div
        className="w-full max-w-4xl"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
      >
        {/* Header Section */}
        <motion.div 
          className="flex items-center justify-center gap-4 flex-wrap mb-8"
          style={{
            marginBottom: "clamp(2rem, 4vh, 3rem)",
          }}
          variants={fadeUp}
        >
          <h2 
            className="text-[var(--accent-gold)] font-light tracking-widest uppercase"
            style={{
              fontSize: "clamp(1.5rem, 2.5vw, 2.5rem)",
              letterSpacing: "0.2em",
              fontWeight: 800,
            }}
          >
            Connect with Scented Fumes
          </h2>
        </motion.div>

        {/* Subscription Form or Success Message */}
        {!isSubmitted ? (
          <motion.form 
            className="flex flex-col sm:flex-row w-full gap-4 mb-10"
            style={{
              gap: "clamp(1rem, 2vw, 1.5rem)",
              marginBottom: "clamp(2rem, 4vh, 3rem)",
            }}
            variants={fadeUp}
            onSubmit={handleSubmit}
          >
            <input
              type="email"
              placeholder="Your Email Address"
              required
              className="flex-grow bg-transparent border-b-2 border-[var(--accent-gold)] px-4 py-3 text-[var(--accent-gold)] placeholder-[var(--text-muted)] outline-none focus:border-b-2 focus:border-[var(--text-secondary)] transition-all font-light"
              style={{
                fontSize: "clamp(0.95rem, 1vw, 1.1rem)",
                borderBottom: "2px solid var(--accent-gold)",
              }}
