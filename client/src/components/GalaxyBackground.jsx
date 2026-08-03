import { useEffect, useRef } from 'react';
import './GalaxyBackground.css';

/**
 * Fixed full-viewport animated starfield + nebula glow.
 * Purely canvas/JS — no external images.
 */
export default function GalaxyBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let w, h, stars, driftStars, rafId;

    function initStars() {
      stars = [];
      const count = Math.floor((w * h) / 7000);
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.3 + 0.25,
          base: Math.random() * 0.5 + 0.25,
          speed: Math.random() * 0.015 + 0.006,
          phase: Math.random() * Math.PI * 2,
          hue: Math.random() < 0.15 ? '227,169,74' : '243,231,228'
        });
      }
      driftStars = [];
      const driftCount = Math.floor(count / 12);
      for (let i = 0; i < driftCount; i++) {
        driftStars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.6 + 0.8,
          vy: Math.random() * 0.04 + 0.015,
          alpha: Math.random() * 0.5 + 0.3
        });
      }
    }

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      initStars();
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);

      const g1 = ctx.createRadialGradient(w * 0.22, h * 0.12, 0, w * 0.22, h * 0.12, w * 0.65);
      g1.addColorStop(0, 'rgba(110,27,50,0.30)');
      g1.addColorStop(1, 'rgba(5,2,3,0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);

      const g2 = ctx.createRadialGradient(w * 0.85, h * 0.88, 0, w * 0.85, h * 0.88, w * 0.55);
      g2.addColorStop(0, 'rgba(196,49,91,0.20)');
      g2.addColorStop(1, 'rgba(5,2,3,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      stars.forEach((s) => {
        const twinkle = s.base + Math.sin(t * s.speed * 3 + s.phase) * 0.28;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${s.hue},${Math.max(0, Math.min(1, twinkle))})`;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });

      driftStars.forEach((s) => {
        ctx.beginPath();
        ctx.fillStyle = `rgba(227,169,74,${s.alpha})`;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        s.y += s.vy;
        if (s.y > h + 5) {
          s.y = -5;
          s.x = Math.random() * w;
        }
      });

      rafId = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    rafId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return <canvas ref={canvasRef} className="galaxy-canvas" />;
}