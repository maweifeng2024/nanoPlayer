import type { Metadata } from 'next';
import Link from 'next/link';
import { Apple, ArrowLeft, CheckCircle2, Clock3, MonitorDown, ShieldCheck, Terminal } from 'lucide-react';

export const metadata: Metadata = {
  title: '下载',
  description: '下载 nanoPlayer macOS 测试版，并查看各平台构建状态。',
};

const platforms = [
  { icon: Apple, name: 'macOS', packageName: 'Apple Silicon DMG · 10.2 MB', requirement: 'macOS 12 或更高版本 · 未经 Apple 公证', status: '测试版可下载', tone: 'active', href: '/downloads/v0.1.0/nanoPlayer_0.1.0_aarch64.dmg' },
  { icon: MonitorDown, name: 'Windows', packageName: 'NSIS / MSI', requirement: 'Windows 10 或更高版本', status: '等待 Windows 构建', tone: 'planned' },
  { icon: Terminal, name: 'Linux', packageName: 'AppImage / deb', requirement: '主流 64 位发行版', status: '规划中', tone: 'planned' },
];

export default function DownloadPage() {
  return (
    <main className="download-shell">
      <header className="download-header">
        <Link href="/"><ArrowLeft size={16} />返回首页</Link>
        <Link className="site-brand" href="/"><span>nano</span>Player</Link>
      </header>
      <section className="download-intro">
        <p className="kicker">DOWNLOADS</p>
        <h1>下载 nanoPlayer</h1>
        <p>当前提供 v0.1.0 Apple Silicon 测试版；Windows 版本仍需在对应系统完成构建与验证。</p>
        <div className="status-notice"><Clock3 size={18} /><div><strong>测试版本</strong><span>macOS 安装包已通过镜像完整性校验，但尚未使用 Apple Developer 证书签名或公证，首次打开可能触发系统安全提示。</span></div></div>
      </section>
      <section className="platform-grid" aria-label="平台下载状态">
        {platforms.map(({ icon: Icon, name, packageName, requirement, status, tone, href }) => (
          <article key={name} className={tone}>
            <div className="platform-icon"><Icon aria-hidden="true" size={24} /></div>
            <div className="platform-title"><h2>{name}</h2><span>{status}</span></div>
            <p>{packageName}</p>
            <small>{requirement}</small>
            {href ? <a className="download-button" href={href} download>下载 v0.1.0</a> : <button aria-disabled="true" disabled type="button">暂未开放下载</button>}
          </article>
        ))}
      </section>
      <section className="release-trust">
        <h2>每个公开版本都需要经过</h2>
        <ul>
          <li><CheckCircle2 size={17} />安装包签名与平台验证</li>
          <li><CheckCircle2 size={17} />SHA-256 校验文件</li>
          <li><CheckCircle2 size={17} />真实系统安装、升级和卸载测试</li>
          <li><CheckCircle2 size={17} />源音乐目录只读回归检查</li>
        </ul>
      </section>
      <section className="download-safety"><ShieldCheck /><p><strong>核对安装包完整性</strong><span>macOS DMG 的 SHA-256：c377eda64322aee0bd6ea0bf16e9659ed2b8c361fb4d9585cab9b36141079787。也可下载 <Link href="/downloads/v0.1.0/SHA256SUMS.txt">SHA256SUMS.txt</Link>。</span></p></section>
      <footer className="site-footer"><span>nanoPlayer</span><span>版本状态与安装包保持同步</span></footer>
    </main>
  );
}
