import { motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';

type FeatureCardProps = {
  title: string;
  description: string;
  points?: string[];
  media: string;
  alt: string;
  reverse?: boolean;
};

export default function FeatureCard({
  title,
  description,
  points,
  media,
  alt,
  reverse,
}: FeatureCardProps) {
  const reduce = useReducedMotion();

  return (
    <div className="grid grid-cols-1 items-center gap-10 py-12 md:grid-cols-2 md:gap-16">
      <motion.div
        initial={reduce ? false : { opacity: 0, x: reverse ? 24 : -24 }}
        whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
        className={reverse ? 'md:order-2' : ''}
      >
        <div className="overflow-hidden rounded-2xl border border-paper-line bg-paper-tint shadow-[0_24px_48px_-24px_rgba(10,10,10,0.25)]">
          <img src={media} alt={alt} loading="lazy" className="block h-auto w-full" />
        </div>
      </motion.div>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1], delay: 0.05 }}
        className={reverse ? 'md:order-1' : ''}
      >
        <h3 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h3>
        <p className="mt-3 text-base leading-relaxed text-ink-soft">{description}</p>
        {points && points.length > 0 && (
          <ul className="mt-5 space-y-2.5">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-ink-soft">
                <Check size={16} className="mt-0.5 shrink-0 text-ink-faint" strokeWidth={2} />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </div>
  );
}
