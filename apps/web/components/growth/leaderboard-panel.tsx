import type { LeaderboardEntry } from '@mcserauth/shared';
import Link from 'next/link';
import Avatar from '@/components/avatar';
import { LevelBadge, TitleBadge } from './user-badges';

export default function LeaderboardPanel({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <section className="card" aria-labelledby="growth-leaderboard-title">
        <div className="panel-head">
          <h2 id="growth-leaderboard-title">等级排行榜</h2>
        </div>
        <p className="growth-section-note">还没有玩家上榜，快去签到攒经验吧。</p>
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="growth-leaderboard-title">
      <div className="panel-head">
        <h2 id="growth-leaderboard-title">等级排行榜</h2>
      </div>
      <div className="growth-table-wrap">
        <table className="growth-table">
          <caption className="sr-only">按等级排序的玩家排行榜。</caption>
          <thead>
            <tr>
              <th scope="col">名次</th>
              <th scope="col">玩家</th>
              <th scope="col">等级</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={entry.userId}>
                <td className="rank">{index + 1}</td>
                <td>
                  <span className="who">
                    <Avatar name={entry.name} src={entry.avatarUrl} size="sm" />
                    <Link href={`/users/${entry.userId}`}>{entry.name}</Link>
                  </span>
                </td>
                <td>
                  <span className="growth-badges-inline">
                    <LevelBadge level={entry.level} tierName={entry.tierName} />
                    {entry.title !== null ? (
                      <TitleBadge name={entry.title.name} color={entry.title.color} />
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
