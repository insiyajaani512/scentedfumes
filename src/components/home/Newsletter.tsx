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
            />
            <button 
              type="submit"
              className="bg-[var(--accent-gold)] text-[var(--bg-main)] px-8 py-3 tracking-widest font-light hover:bg-[var(--text-secondary)] transition-colors uppercase whitespace-nowrap border-2 border-[var(--accent-gold)] rounded-sm"
              style={{
                fontSize: "clamp(0.85rem, 0.95vw, 1rem)",
                letterSpacing: "0.15em",
                paddingLeft: "clamp(2rem, 3vw, 3rem)",
                paddingRight: "clamp(2rem, 3vw, 3rem)",
              }}
            >
              Sign Up
            </button>
          </motion.form>
        ) : (
          <motion.div
            className="mb-10"
            style={{
              marginBottom: "clamp(2rem, 4vh, 3rem)",
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p 
              className="text-[var(--accent-gold)] font-light tracking-widest uppercase"
              style={{
                fontSize: "clamp(1.2rem, 1.8vw, 1.8rem)",
                letterSpacing: "0.15em",
              }}
            >
              ✓ Successfully Signed In
            </p>
          </motion.div>
        )}

        {/* Description Text */}
        <motion.div 
          className="max-w-3xl mx-auto mb-10"
          style={{
            marginBottom: "clamp(2rem, 4vh, 3rem)",
          }}
          variants={fadeUp}
        >
          <p 
            className="text-[var(--accent-gold)] leading-relaxed font-light tracking-wide"
            style={{
              fontSize: "clamp(0.95rem, 1.1vw, 1.2rem)",
              lineHeight: 1.8,
            }}
          >
            Discover the art of fragrance with our collection of premium renditions. Immerse yourself in the aroma of luxury and elevate your style with Scented Fumes.
          </p>
        </motion.div>

        {/* Social Media Icons */}
        <motion.div 
          className="flex items-center justify-center gap-6 flex-wrap"
          style={{
            gap: "clamp(1rem, 2vw, 1.5rem)",
          }}
          variants={fadeUp}
        >
          <SocialCircleIcon href="https://www.facebook.com/share/1DaXQTRLcB/">
            <Facebook size={20} fill="currentColor" stroke="none" />
          </SocialCircleIcon>
          <SocialCircleIcon href="https://www.instagram.com/scentedfumes.official">
            <Instagram size={20} />
          </SocialCircleIcon>
          <SocialCircleIcon href="https://www.tiktok.com/@scented.fumes">
            <Music2 size={20} />
          </SocialCircleIcon>
          <SocialCircleIcon href="https://wa.me/923321300655">
            <MessageCircle size={20} fill="currentColor" stroke="none" />
          </SocialCircleIcon>
        </motion.div>
      </motion.div>
    </section>
  );
};

// Helper component for social icons
const SocialCircleIcon = ({ children, href }: { children: React.ReactNode; href: string }) => (
  <a 
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center justify-center rounded-full bg-[var(--accent-gold)] text-[var(--bg-main)] hover:bg-[var(--text-secondary)] transition-colors duration-300"
    style={{
      width: "clamp(2.5rem, 3.5vw, 3rem)",
      height: "clamp(2.5rem, 3.5vw, 3rem)",
    }}
  >
    {children}
  </a>
);

export default ScentedFumesNewsletter;
