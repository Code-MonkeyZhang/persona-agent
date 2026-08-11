import { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

type SectionProps = {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
};

export function SectionHeading({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div className="max-w-2xl">
      {eyebrow && (
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-ink-faint">
          {eyebrow}
        </p>
      )}
      <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h2>
    </div>
  );
}

export default function Section({ eyebrow, title, children }: SectionProps) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="py-16"
    >
      <div className="container-wide">
        <SectionHeading eyebrow={eyebrow} title={title} />
        {children && <div className="mt-8">{children}</div>}
      </div>
    </motion.section>
  );
}
