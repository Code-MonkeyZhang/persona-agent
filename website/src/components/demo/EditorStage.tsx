import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useLocale, type I18nKey } from '../../i18n';
import aronaAvatar from '../../assets/demo/arona-avatar.png';
import aronaPose from '../../assets/demo/arona-pose.png';
import aronaPoseHappy from '../../assets/demo/arona-pose-happy.png';
import aronaPoseLike from '../../assets/demo/arona-pose-like.png';
import aronaPoseShy from '../../assets/demo/arona-pose-shy.png';
import kurisuAvatar from '../../assets/demo/kurisu-avatar.png';
import kurisuPose from '../../assets/demo/kurisu-pose.png';
import kurisuPoseSmile from '../../assets/demo/kurisu-pose-smile.png';
import kurisuPoseThink from '../../assets/demo/kurisu-pose-think.png';
import kurisuPoseAngry from '../../assets/demo/kurisu-pose-angry.png';
import luAvatar from '../../assets/demo/lu-avatar.png';
import luPose from '../../assets/demo/lu-pose.png';
import luPoseFocus from '../../assets/demo/lu-pose-focus.png';
import luPoseHappy from '../../assets/demo/lu-pose-happy.png';
import luPoseStern from '../../assets/demo/lu-pose-stern.png';
import adultAvatar from '../../assets/demo/arona-adult-avatar.png';
import adultPose from '../../assets/demo/arona-adult-pose.png';
import adultPoseGentle from '../../assets/demo/arona-adult-pose-gentle.png';
import adultPoseCalm from '../../assets/demo/arona-adult-pose-calm.png';
import adultPoseRelieved from '../../assets/demo/arona-adult-pose-relieved.png';

/** One showcase character with its art set and the i18n key of its name. */
type Showcase = {
  avatar: string;
  poses: string[];
  nameKey: I18nKey;
};

/** The four preset agents shipped with the marketplace, in showcase order. */
const CHARACTERS: Showcase[] = [
  {
    avatar: aronaAvatar,
    poses: [aronaPose, aronaPoseHappy, aronaPoseLike, aronaPoseShy],
    nameKey: 'ed.c1',
  },
  {
    avatar: kurisuAvatar,
    poses: [kurisuPose, kurisuPoseSmile, kurisuPoseThink, kurisuPoseAngry],
    nameKey: 'ed.c2',
  },
  {
    avatar: luAvatar,
    poses: [luPose, luPoseFocus, luPoseHappy, luPoseStern],
    nameKey: 'ed.c3',
  },
  {
    avatar: adultAvatar,
    poses: [adultPose, adultPoseGentle, adultPoseCalm, adultPoseRelieved],
    nameKey: 'ed.c4',
  },
];

/**
 * Pose showcase of the editor section. The current character stands straight
 * on the section background with no frame and no backdrop, a bare avatar row
 * above switches characters and a dot pager below switches poses. The stage
 * tours itself until the visitor interacts, and reduced motion keeps every
 * swap still and instant.
 */
export default function EditorStage() {
  const { t } = useLocale();
  const reduce = useReducedMotion();
  const [char, setChar] = useState(0);
  const [pose, setPose] = useState(0);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (manual || reduce) return;
    const id = window.setInterval(
      () => setPose((current) => (current + 1) % CHARACTERS[char].poses.length),
      3000,
    );
    return () => window.clearInterval(id);
  }, [manual, reduce, char]);

  useEffect(() => {
    if (manual || reduce) return;
    const id = window.setInterval(() => {
      setChar((current) => (current + 1) % CHARACTERS.length);
      setPose(0);
    }, 7000);
    return () => window.clearInterval(id);
  }, [manual, reduce]);

  const current = CHARACTERS[char];

  return (
    <div className="flex min-w-0 flex-col items-center gap-3">
      <div className="flex items-center justify-center gap-3.5">
        {CHARACTERS.map((item, index) => (
          <button
            key={item.nameKey}
            type="button"
            aria-label={t(item.nameKey)}
            aria-pressed={char === index}
            onClick={() => {
              setManual(true);
              setChar(index);
              setPose(0);
            }}
            className={`h-8 w-8 overflow-hidden rounded-full border-2 bg-white transition-transform duration-150 ease-emil-out hover:-translate-y-0.5 ${
              char === index ? 'border-demo-primary ring-[3px] ring-demo-primary/20' : 'border-transparent'
            }`}
          >
            <img src={item.avatar} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      <div className="relative h-[340px] w-[230px] sm:h-[370px]">
        <motion.div
          key={char}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.3, ease: 'linear' }}
          className="absolute inset-0"
        >
          {current.poses.map((src, index) => (
            <motion.img
              key={src}
              src={src}
              alt=""
              initial={false}
              animate={{ opacity: pose === index ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 0.3, ease: 'linear' }}
              className="absolute bottom-0 left-1/2 max-h-full max-w-full -translate-x-1/2 object-contain"
            />
          ))}
        </motion.div>
      </div>

      <div className="flex items-center justify-center gap-[7px]">
        {current.poses.map((src, index) => (
          <button
            key={src}
            type="button"
            aria-label={`${t('ed.pose')} ${index + 1}`}
            onClick={() => {
              setManual(true);
              setPose(index);
            }}
            className={`h-[7px] rounded-full transition-all duration-200 ${
              pose === index ? 'w-5 bg-demo-primary' : 'w-[7px] bg-ink/15 hover:bg-ink/30'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
