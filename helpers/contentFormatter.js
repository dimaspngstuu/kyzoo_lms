function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatLessonContent(rawText) {
  if (!rawText || !rawText.trim()) return '';

  const blocks = rawText.trim().split(/\r?\n\s*\r?\n+/);

  const formattedBlocks = blocks.map(block => {
    const rawLines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (rawLines.length === 0) return '';

    // 1. Cek apakah list items
    if (rawLines.every(line => /^[-*•]\s+/.test(line))) {
      const listItems = rawLines.map(line => {
        let content = line.replace(/^[-*•]\s+/, '');
        content = escapeHtml(content)
          .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>')
          .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
          .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono text-xs text-brand-600 dark:text-brand-400 font-semibold">$1</code>');

        return `
          <li class="flex items-start gap-3 text-sm sm:text-base leading-relaxed text-slate-700 dark:text-slate-300">
            <span class="w-2 h-2 rounded-full bg-brand-500 mt-2 shrink-0"></span>
            <span class="flex-1">${content}</span>
          </li>`;
      }).join('');

      return `<ul class="space-y-2.5 my-3 pl-1">${listItems}</ul>`;
    }

    // 2. Heading Markdown (#, ##, ###)
    if (/^#{1,4}\s+/.test(rawLines[0])) {
      const headingText = rawLines[0].replace(/^#{1,4}\s+/, '');
      const escaped = escapeHtml(headingText)
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>');
      return `<h3 class="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-6 mb-2 tracking-tight">${escaped}</h3>`;
    }

    // 3. Baris pendek sebagai Subtopik / Pertanyaan
    if (rawLines.length === 1) {
      const single = rawLines[0];
      const isQuestion = single.endsWith('?');
      const isColonHeader = single.includes(':') && single.length < 100 && !single.includes('http');
      const isShortHeading = single.length < 60 && !single.endsWith('.') && !single.endsWith(',');

      if (isQuestion || isColonHeader || isShortHeading) {
        const escaped = escapeHtml(single)
          .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>');
        return `<h3 class="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-6 mb-2 tracking-tight">${escaped}</h3>`;
      }
    }

    // 4. Paragraf Standar
    const renderedLines = rawLines.map(line => {
      return escapeHtml(line)
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
        .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono text-xs text-brand-600 dark:text-brand-400 font-semibold">$1</code>');
    }).join('<br>');

    return `<p class="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-slate-300 my-2.5">${renderedLines}</p>`;
  });

  return formattedBlocks.filter(Boolean).join('\n');
}

module.exports = { formatLessonContent };
