import type { UserProgressSummary } from '@mcserauth/shared';
import { Icon } from '@/components/icons';
import { LevelBadge, TitleBadge } from './user-badges';

/** Level header with an accessible XP progress bar (hidden for level-exempt accounts). */
export default function LevelCard({ progress }: { progress: UserProgressSummary }) {
  const percent = Math.min(100, Math.max(0, Math.round(progress.progressPercent)));
  const barSize = progress.xpForNextLevel ?? 100;

  return (
    <section className="card level-card" aria-labelledby="growth-level-title">
      <div className="level-card-head">
        <div className="level-card-title">
          <h2 id="growth-level-title">我的等级</h2>
          {progress.levelExempt ? null : (
            <LevelBadge level={progress.level} tierName={progress.levelTier.name} size="lg" />
          )}
          {progress.title !== null ? (
            <TitleBadge name={progress.title.name} color={progress.title.color} size="lg" />
          ) : null}
        </div>
      </div>

      {progress.levelExempt ? (
        <p className="level-card-exempt">
          <Icon name="shield" width={14} height={14} /> 特别称号不参与等级排行，仅展示称号身份。
        </p>
      ) : progress.isMaxLevel ? (
        <p className="level-card-exempt">已达 100 级， XP 进度已封顶。</p>
      ) : (
        <div>
          <div
            className="xp-track"
            role="progressbar"
            aria-label={`升到 Lv.${progress.level + 1} 的经验进度`}
            aria-valuenow={progress.xpIntoLevel}
            aria-valuemin={0}
            aria-valuemax={barSize}
            aria-valuetext={`${progress.xpIntoLevel} / ${barSize} XP`}
          >
            <div
              className="xp-fill"
              style={{
                width: `${percent}%`,
                background: progress.levelTier.color,
              }}
            />
          </div>
          <div className="xp-legend">
            <span>
              本级经验 <strong>{progress.xpIntoLevel}</strong> / {barSize} XP
            </span>
            <span>
              累计 <strong>{progress.xp}</strong> XP · {percent}%
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
