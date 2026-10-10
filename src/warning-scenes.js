import { SceneTriggers } from './scenes.js';
import { WARNING_URL } from './warnings.js';

export const WARNING_LEVELS = [2, 3, 4, 5];
// Separate capacity ensures a forecast burst cannot starve official warnings.
// 240 forecast attempts + 50 warning attempts stay below the SDK's 300/min limit.
const MAX_ATTEMPTS = 50;

export class WarningScenes extends SceneTriggers {
  constructor({ warnings, ...options }) {
    super({ ...options, stateFile: 'warning-scene-state.json' });
    this.warnings = warnings;
  }

  async restore() {
    await super.restore();
    this.active = new Set(
      [...this.active].filter((key) => {
        try {
          const value = JSON.parse(key);
          return (
            Array.isArray(value) &&
            value.length === 5 &&
            typeof value[0] === 'string' &&
            Array.isArray(JSON.parse(value[0])) &&
            typeof value[1] === 'string' &&
            Number.isFinite(value[2]) &&
            WARNING_LEVELS.includes(value[3]) &&
            WARNING_LEVELS.includes(value[4])
          );
        } catch {
          return false;
        }
      }),
    );
  }

  async run(houses) {
    if (this.stopped || !this.gladys.connected) return;
    if (!this.restored) {
      await this.restore();
      this.restored = true;
    }
    const retained = new Set();
    let deferred = false;
    for (const house of houses) {
      const houseKey = JSON.stringify([house.selector, house.latitude, house.longitude]);
      const warnings = this.warnings.get(house);
      if (!warnings) {
        // Missing/stale feeds never mean that a warning has been cancelled.
        for (const key of this.active) if (JSON.parse(key)[0] === houseKey) retained.add(key);
        continue;
      }
      for (const warning of [...warnings].sort((a, b) => b.warnlevel - a.warnlevel)) {
        for (const minimum of WARNING_LEVELS) {
          const identity = (level) =>
            JSON.stringify([houseKey, warning.warn_type, warning.onset, minimum, level]);
          for (const level of WARNING_LEVELS) retained.add(identity(level));
          if (
            warning.warnlevel < minimum ||
            WARNING_LEVELS.some(
              (level) => level >= warning.warnlevel && this.active.has(identity(level)),
            )
          )
            continue;
          if (this.stopped || !this.gladys.connected) return;
          // Publishing can await network I/O. Recheck validity before every send.
          if (
            !this.warnings
              .get(house)
              ?.some(
                (current) =>
                  current.warn_type === warning.warn_type &&
                  current.onset === warning.onset &&
                  current.warnlevel === warning.warnlevel,
              )
          )
            continue;
          const time = this.now();
          this.sendTimes = this.sendTimes.filter((sent) => sent > time - 60_000);
          if (this.sendTimes.length >= MAX_ATTEMPTS) {
            deferred = true;
            continue;
          }
          this.sendTimes.push(time);
          try {
            await this.gladys.publishSceneEvent('official_warning', {
              house: house.selector,
              house_name: house.name,
              phenomenon: warning.warn_type,
              minimum_level: String(minimum),
              level: warning.warnlevel,
              starts_at: new Date(warning.onset * 1000).toISOString(),
              ends_at: new Date(warning.expires * 1000).toISOString(),
              source: 'MeteoSwiss',
              source_url: WARNING_URL,
            });
            this.active.add(identity(warning.warnlevel));
            this.dirty = true;
            await this.save();
          } catch (error) {
            deferred = true;
            this.logger.warn('Cannot publish official warning scene event', {
              error: error.message,
            });
          }
        }
      }
    }
    for (const key of this.active) {
      if (!retained.has(key)) {
        this.active.delete(key);
        this.dirty = true;
      }
    }
    await this.save();
    if (deferred && !this.retryTimer && !this.stopped) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.evaluate(this.latestHouses);
      }, 60_000);
      this.retryTimer.unref();
    }
  }
}
