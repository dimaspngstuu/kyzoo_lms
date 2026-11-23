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

function formatLessonContent(rawText) {
  if (!rawText || !rawText.trim()) return '';

  const blocks = rawText.trim().split(/\r?\n\s*\r?\n+/);

  const formattedBlocks = blocks.map(block => {
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
