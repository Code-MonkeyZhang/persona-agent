import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useLocale } from '../../i18n';
import { DemoWindow } from './chrome';
import { useSceneClock } from './useSceneClock';
import {
  AgentBubble,
  AgentRail,
  AgentRow,
  ChatHeader,
  InputBox,
  ThinkingChip,
  ToolCard,
  UserRow,
} from './heroParts';
import aronaBg from '../../assets/demo/arona-bg.jpg';
import aronaPoseDefault from '../../assets/demo/arona-pose.png';
import aronaPoseHappy from '../../assets/demo/arona-pose-happy.png';
import aronaPoseLike from '../../assets/demo/arona-pose-like.png';

/** Frame thresholds of the single hero scene in milliseconds. */
const T = {
  typingEnd: 1800,
  thinkEnd: 3000,
  toolLineStart: 3100,
  toolLineStep: 450,
  toolDone: 4300,
  replyAt: 5200,
  button: 5800,
  slide: 6400,
  typeStart: 7400,
  typeEnd: 8800,
  speak: 9600,
  bubble2: 10600,
};

const DURATION = 12000;
const POSES = [aronaPoseDefault, aronaPoseHappy, aronaPoseLike];

/** Counts how many staggered tool lines are visible at the given elapsed time. */
function visibleCount(elapsed: number, start: number, step: number, total: number) {
  if (elapsed < start) return 0;
  return Math.min(total, Math.floor((elapsed - start) / step) + 1);
}

/**
 * The single hero scene, one shot from chat to companion. The strip holds the
 * chat list and the companion artwork, the input box rides a floating layer
 * that never moves, replies land as whole messages, and the pose cross fades
 * its expression as each companion reply arrives.
 */
export default function HeroScene({ running, reduced }: { running: boolean; reduced: boolean }) {
  const { t } = useLocale();
  const elapsed = useSceneClock(DURATION, running, reduced);

  const question = t('hwin.userMsg');
  const typing1 = elapsed < T.typingEnd;
  const typed1 = typing1
    ? question.slice(0, Math.floor((elapsed / T.typingEnd) * question.length))
    : '';

  const thinkLines = t('hwin.thinkLines').split('|');
  const replyLines = t('hwin.replyLines').split('|');

  const buttonOn = elapsed >= T.button;
  const companion = elapsed >= T.slide;
  const [poseMounted, setPoseMounted] = useState(false);

  // The pose stays mounted after the first slide so the loop wrap never blanks the character while the strip slides back.
  useEffect(() => {
    if (companion) setPoseMounted(true);
  }, [companion]);

  const message2 = t('comp.userMsg');
  const typing2 = elapsed >= T.typeStart && elapsed < T.typeEnd;
  const sent2 = elapsed >= T.typeEnd;
  const typed2 =
    elapsed < T.typeStart || sent2
      ? ''
      : message2.slice(
          0,
          Math.floor(((elapsed - T.typeStart) / (T.typeEnd - T.typeStart)) * message2.length),
        );

  const thinking = sent2 && elapsed < T.speak;
  const replyText = thinking
    ? t('comp.thinking')
    : elapsed >= T.bubble2
      ? t('comp.b2')
      : elapsed >= T.speak
        ? t('comp.b1')
        : '';
  const poseIndex = elapsed >= T.bubble2 ? 2 : elapsed >= T.speak ? 1 : 0;

  const typed = typing1 ? typed1 : typing2 ? typed2 : '';

  return (
    <DemoWindow lights>
      <div className="flex h-[458px] min-h-0 select-none">
        <AgentRail />
        <div className="flex min-w-0 flex-1 flex-col">
          <ChatHeader companionActive={buttonOn} />
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {/* The app slides one 200 percent wide strip so the chat list and the companion pane each fill the stage. */}
            <motion.div
              className="flex h-full w-[200%]"
              initial={false}
              animate={{ x: companion ? '-50%' : '0%' }}
              transition={{ duration: reduced ? 0 : 0.3, ease: 'easeOut' }}
            >
              <div className="flex h-full w-1/2 min-w-0 flex-col justify-end gap-3 overflow-hidden px-4 pb-[128px] pt-4">
                {elapsed >= T.typingEnd ? <UserRow text={question} /> : null}
                {elapsed >= T.typingEnd && elapsed < T.thinkEnd ? (
                  <AgentRow>
                    <ThinkingChip label={t('hwin.thinking')} />
                  </AgentRow>
                ) : null}
                {elapsed >= T.thinkEnd ? (
                  <AgentRow>
                    <ToolCard
                      title={t('hwin.tool')}
                      lines={thinkLines.slice(
                        0,
                        visibleCount(elapsed, T.toolLineStart, T.toolLineStep, thinkLines.length),
                      )}
                      done={elapsed >= T.toolDone}
                    />
                  </AgentRow>
                ) : null}
                {elapsed >= T.replyAt ? (
                  <AgentRow>
                    <AgentBubble lines={replyLines} />
                  </AgentRow>
                ) : null}
              </div>

              <div className="relative h-full w-1/2 shrink-0 overflow-hidden border-l border-demo-border">
                <img src={aronaBg} alt="" className="absolute inset-0 h-full w-full object-cover" />
                {poseMounted
                  ? POSES.map((src, index) => (
                      <motion.img
                        key={src}
                        src={src}
                        alt=""
                        initial={reduced ? false : { opacity: 0 }}
                        animate={{ opacity: poseIndex === index ? 1 : 0 }}
                        transition={{ duration: reduced ? 0 : 0.3, ease: 'linear' }}
                        className="absolute bottom-0 left-1/2 z-[1] h-full -translate-x-1/2 translate-y-[5%] object-contain object-bottom"
                      />
                    ))
                  : null}
              </div>
            </motion.div>

            {/* Floating layer shared by both modes, the box itself never moves and only the backdrop drops in companion mode. */}
            <div className="absolute inset-x-0 bottom-0 z-20">
              {companion && replyText ? (
                <motion.div
                  key={replyText}
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className="mx-4 mb-2 shrink-0 rounded-[24px] border border-white/50 bg-white/80 px-4 py-2.5 text-[13px] leading-relaxed text-demo-fg shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md"
                >
                  {thinking ? (
                    <span className="block animate-pulse text-center text-demo-muted-fg">
                      {replyText}
                    </span>
                  ) : (
                    replyText
                  )}
                </motion.div>
              ) : null}
              <div className={companion ? '' : 'bg-white/80 backdrop-blur-md'}>
                <InputBox typed={typed} caret={typing1 || typing2} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </DemoWindow>
  );
}
