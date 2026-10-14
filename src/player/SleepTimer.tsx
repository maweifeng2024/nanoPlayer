import { useModalBehavior } from "../useModalBehavior";
import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { t } from "../i18n";
import { useNanoStore } from "../store";
import { sendMobilePlayback } from "../platform/mobile";

export function SleepTimer() {
  const timer = useNanoStore((state) => state.sleepTimer);
  const [open, setOpen] = useState(false);
  const panelRef = useModalBehavior(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      event.preventDefault();
      setOpen(false);
    };
    window.addEventListener("android-back", close);
    return () => window.removeEventListener("android-back", close);
  }, [open]);
  const [minutes, setMinutes] = useState("15");
  const [finishTrack, setFinishTrack] = useState(false);
  const valid =
    Number.isInteger(Number(minutes)) && Number(minutes) >= 1 && Number(minutes) <= 1440;
  const start = (duration: number) => {
    sendMobilePlayback("sleepTimer", { minutes: duration, finishTrack });
    setOpen(false);
  };
  return (
    <div className="sleep-timer">
      <button
        className="icon-button"
        aria-label={t("定时停止播放")}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Timer size={20} />
        <span>{t("定时停止播放")}</span>
        {timer && (
          <span>{timer.waiting ? t("本曲结束") : `${Math.ceil(timer.remainingMs / 60000)}m`}</span>
        )}
      </button>
      {open && (
        <section
          ref={panelRef}
          className="sleep-timer-panel"
          role="dialog"
          aria-label={t("定时停止播放")}
        >
          <strong>{t("定时停止播放")}</strong>
          {timer && (
            <p role="status">
              {timer.waiting
                ? t("将在当前歌曲结束后停止")
                : t("剩余 {0} 分钟", Math.ceil(timer.remainingMs / 60000))}
            </p>
          )}
          <label>
            {t("停止方式")}
            <select
              value={finishTrack ? "finish" : "now"}
              onChange={(event) => setFinishTrack(event.target.value === "finish")}
            >
              <option value="now">{t("到时立即停止")}</option>
              <option value="finish">{t("当前歌曲结束后停止")}</option>
            </select>
          </label>
          <div className="sleep-presets">
            {[15, 30, 60].map((value) => (
              <button className="secondary-button" key={value} onClick={() => start(value)}>
                {t("{0} 分钟", value)}
              </button>
            ))}
          </div>
          <label>
            {t("自定义分钟（1–1440）")}
            <input
              type="number"
              min="1"
              max="1440"
              step="1"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </label>
          <button
            className="secondary-button"
            disabled={!valid}
            onClick={() => start(Number(minutes))}
          >
            {t("开始计时")}
          </button>
          {timer && (
            <button className="text-button" onClick={() => start(0)}>
              {t("取消定时")}
            </button>
          )}
          <button className="text-button" onClick={() => setOpen(false)}>
            {t("关闭")}
          </button>
        </section>
      )}
    </div>
  );
}
