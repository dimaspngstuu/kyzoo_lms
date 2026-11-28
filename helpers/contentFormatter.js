function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInline(str) {
  if (!str) return '';
  return escapeHtml(str)
    // 1. Teks Tebal (**teks**)
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>')
    // 2. Teks Miring (*teks*)
    .replace(/\*(.*?)\*/g, '<em class="italic text-slate-800 dark:text-slate-200">$1</em>')
    // 3. Teks Kode / Istilah (`kode`)
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono text-xs text-brand-600 dark:text-brand-400 font-semibold">$1</code>')
    // 4. Tautan Link Markdown ([teks](https://...))
    .replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-brand-600 dark:text-brand-400 font-bold underline hover:text-brand-700 inline-flex items-center gap-0.5">$1 <svg class="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg></a>');
}

function hashPromptText(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return 'p_' + (hash >>> 0).toString(36);
}

function renderMacPromptBox(rawCode, label = '') {
  const cleanCode = (rawCode || '').replace(/^\r?\n+|\r?\n+$/g, '');
  const promptId = hashPromptText(cleanCode);
  const labelHtml = label && label.trim()
    ? `<span class="ml-2 text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">${escapeHtml(label.trim())}</span>`
    : '';

  return `
    <div class="kyzoo-prompt-box my-5 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden" data-prompt-id="${promptId}">
      <div class="flex items-center justify-between px-4 py-2.5 bg-slate-50/90 dark:bg-slate-800/80 border-b border-slate-200/80 dark:border-slate-700/70">
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-[#ff5f56] inline-block"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] inline-block"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-[#27c93f] inline-block"></span>
          ${labelHtml}
        </div>
        <div class="flex items-center gap-2">
          <button type="button" onclick="togglePromptBookmark(this)" data-prompt-bookmark-btn class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-700 text-[11px] font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs">
            <svg class="w-3.5 h-3.5 text-slate-400 kyzoo-bookmark-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path></svg>
            <span class="kyzoo-bookmark-text">Simpan</span>
          </button>
          <button type="button" onclick="copyPromptBlock(this)" data-prompt-copy-btn class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-brand-600 hover:border-brand-300 dark:hover:border-brand-500/60 text-[11px] font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs">
            <svg class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 kyzoo-copy-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
            <span class="kyzoo-copy-text">Salin</span>
          </button>
        </div>
      </div>
      <pre class="p-4 sm:p-5 text-xs sm:text-[13px] font-mono text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap break-words overflow-x-auto m-0 kyzoo-prompt-content">${escapeHtml(cleanCode)}</pre>
    </div>`;
}

function formatLessonContent(rawText) {
  if (!rawText || !rawText.trim()) return '';

  // Ekstrak blok prompt / kode multi-baris (``` ... ```) sebelum pemecahan paragraf
  const codeBlocks = [];
  const textWithPlaceholders = rawText.replace(/```([^\r\n`]*)\r?\n([\s\S]*?)```/g, (match, label, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(renderMacPromptBox(code, label));
    return `\n\n@@CODEBLOCK_${idx}@@\n\n`;
  });

  const blocks = textWithPlaceholders.trim().split(/\r?\n\s*\r?\n+/);

  const formattedBlocks = blocks.map(block => {
    const trimmedBlock = block.trim();
    const codeMatch = trimmedBlock.match(/^@@CODEBLOCK_(\d+)@@$/);
    if (codeMatch) {
      return codeBlocks[Number(codeMatch[1])] || '';
    }

    const rawLines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (rawLines.length === 0) return '';

    // 1. Daftar Poin / Bullet List (- atau * atau •)
    if (rawLines.every(line => /^[-*•]\s+/.test(line))) {
      const listItems = rawLines.map(line => {
        const content = line.replace(/^[-*•]\s+/, '');
        return `
          <li class="flex items-start gap-3 text-sm sm:text-base leading-relaxed text-slate-700 dark:text-slate-300">
            <span class="w-2 h-2 rounded-full bg-brand-500 mt-2 shrink-0"></span>
            <span class="flex-1">${formatInline(content)}</span>
          </li>`;
      }).join('');

      return `<ul class="space-y-2.5 my-3 pl-1">${listItems}</ul>`;
    }

    // 2. Daftar Nomor Berurutan (1. 2. 3.)
    if (rawLines.every(line => /^\d+\.\s+/.test(line))) {
      const listItems = rawLines.map((line, idx) => {
        const content = line.replace(/^\d+\.\s+/, '');
        return `
          <li class="flex items-start gap-3 text-sm sm:text-base leading-relaxed text-slate-700 dark:text-slate-300">
            <span class="w-5 h-5 rounded-full bg-brand-100 text-brand-700 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">${idx + 1}</span>
            <span class="flex-1">${formatInline(content)}</span>
          </li>`;
      }).join('');

      return `<ol class="space-y-2.5 my-3 pl-1">${listItems}</ol>`;
    }

    // 3. Kotak Catatan / Highlight / Quote (> Catatan)
    if (rawLines.every(line => /^>\s*/.test(line))) {
      const quoteContent = rawLines.map(line => line.replace(/^>\s*/, '')).join('<br>');
      return `
        <blockquote class="p-4 my-3.5 bg-brand-50/70 border-l-4 border-brand-500 rounded-r-2xl text-xs sm:text-sm leading-relaxed text-slate-800 font-medium">
          ${formatInline(quoteContent)}
        </blockquote>`;
    }

    // 4. Heading Markdown (#, ##, ###)
    if (/^#{1,4}\s+/.test(rawLines[0])) {
      const headingText = rawLines[0].replace(/^#{1,4}\s+/, '');
      return `<h3 class="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-6 mb-2 tracking-tight">${formatInline(headingText)}</h3>`;
    }

    // 5. Baris pendek sebagai Subtopik / Pertanyaan
    if (rawLines.length === 1) {
      const single = rawLines[0];
      const isQuestion = single.endsWith('?');
      const isColonHeader = single.includes(':') && single.length < 100 && !single.includes('http');
      const isShortHeading = single.length < 60 && !single.endsWith('.') && !single.endsWith(',');

      if (isQuestion || isColonHeader || isShortHeading) {
        return `<h3 class="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-6 mb-2 tracking-tight">${formatInline(single)}</h3>`;
      }
    }

    // 6. Paragraf Standar
    const renderedLines = rawLines.map(line => formatInline(line)).join('<br>');
    return `<p class="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-slate-300 my-2.5">${renderedLines}</p>`;
  });

  return formattedBlocks.filter(Boolean).join('\n');
}

module.exports = { formatLessonContent };
