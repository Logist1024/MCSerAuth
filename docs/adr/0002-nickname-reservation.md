# ADR 0002：昵称 30 天保留表

- 状态：已采纳
- 日期：2026-10-24

## 背景

旧实现只检查 `player.previous_nickname`，A → B → C 两次改名后，A 不再受 30 天保留保护，与页面文案不符。

## 决策

- 新增 `nickname_reservation(nickname PK, player_uuid, reserved_until)`。
- 改名事务内写入旧昵称的保留记录；同一玩家不受自己的保留限制。
- 启动时从 `player.nickname_history` + `name_cooldown_at` 幂等回填历史数据。
- 保留记录按昵称索引查询，过期记录由维护任务或查询条件忽略。

## 影响

- 改名与玩家自动创建都会检查保留表。
- 回填是保守的：历史记录只能获知最后一次改名时间，旧名统一保留到最后一次改名 + 30 天。
