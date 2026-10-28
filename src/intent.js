import { OUTFITS } from './wardrobe.js';

const ALIASES = {
  formula: ['公式', '经典', '初音', '原始', '舞台服', '公式服', '01'],
  midnight: ['午夜', '礼装', '礼服', '晚宴', '长裙', '深海', '藏蓝', '02'],
  sakura: ['樱', '和装', '和服', '浴衣', '樱花', '宽袖', '03'],
  cyber: ['机能', '赛博', '夹克', '战术', '机甲', '工装', '04'],
  lounge: ['居家', '卫衣', '休闲', '睡衣', '奶油', '放松', '05'],
  stage: ['舞台', '月白', '纱裙', '演出', '白裙', '银', '06'],
};

const COLORS = {
  black: { words: ['黑', '墨黑', '暗黑'], hex: '#171a1e' },
  white: { words: ['白', '象牙白', '月白', '雪白'], hex: '#f2efe5' },
  cream: { words: ['奶油', '米白', '燕麦', '杏色', '奶茶'], hex: '#e5d6c2' },
  pink: { words: ['粉', '樱花粉', '玫瑰', '桃粉'], hex: '#c97588' },
  blue: { words: ['蓝', '藏蓝', '雾蓝', '深海'], hex: '#31496f' },
  teal: { words: ['青', '薄荷', '蓝绿', '松石'], hex: '#32ceb9' },
  gold: { words: ['金', '香槟金', '暖金'], hex: '#c9aa65' },
  silver: { words: ['银', '雾银', '铂金'], hex: '#bfc5c9' },
  red: { words: ['红', '酒红', '莓红'], hex: '#943b48' },
  purple: { words: ['紫', '薰衣草', '葡萄'], hex: '#705b8d' },
  gray: { words: ['灰', '炭灰', '石墨'], hex: '#5c6365' },
  sage: { words: ['鼠尾草', '灰绿', '橄榄'], hex: '#7c9d96' },
};

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[，。！？、,.!?；;：:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findOutfit(s) {
  let best = null;
  for (const [id, words] of Object.entries(ALIASES)) {
    const hits = words
      .map((word) => ({ word, start: s.indexOf(word) }))
      .filter((hit) => hit.start >= 0);
    if (!hits.length) continue;
    // “月白舞台长裙”同时命中“舞台”和“长裙”时，应选命中词更多、
    // 且第一个关键词更靠前的造型，避免被通用的“长裙”抢走。
    const score = hits.reduce((sum, hit) => sum + hit.word.length, 0);
    const first = Math.min(...hits.map((hit) => hit.start));
    if (!best || score > best.score || (score === best.score && first < best.first)) {
      best = { id, score, first };
    }
  }
  return best ? best.id : null;
}

function findColors(s) {
  const hits = [];
  for (const [name, data] of Object.entries(COLORS)) {
    for (const word of data.words) {
      const start = s.indexOf(word);
      if (start >= 0) hits.push({ name, hex: data.hex, start, end: start + word.length, length: word.length });
    }
  }
  // 先认长词，避免“米白”同时命中“白”、“灰绿”同时命中“灰”；
  // 再按出现顺序保留彼此不重叠的颜色（如“黑金”仍能拆成两种色）。
  hits.sort((a, b) => b.length - a.length || a.start - b.start);
  const found = [];
  for (const hit of hits) {
    if (found.some((f) => f.name === hit.name)) continue;
    if (found.some((f) => hit.start < f.end && f.start < hit.end)) continue;
    found.push(hit);
  }
  return found.sort((a, b) => a.start - b.start);
}

function findAction(s) {
  if (/转一圈|转个圈|转一下|旋转一圈/.test(s)) return 'spin';
  if (/转身|转过去|转过来|背面/.test(s)) return 'turn';
  if (/挥手|招手|打个招呼|嗨/.test(s)) return 'wave';
  if (/跳舞|舞一下|来一段|动起来/.test(s)) return 'dance';
  if (/伸展|伸个懒腰|举手|伸懒腰/.test(s)) return 'stretch';
  if (/定格|摆.*姿势|拍照|亮相/.test(s)) return 'pose';
  if (/站好|别动|停下|待机|安静/.test(s)) return 'idle';
  return null;
}

export function parseIntent(text, currentId = 'formula') {
  const s = normalize(text);
  const outfitId = findOutfit(s);
  const colors = findColors(s);
  const action = findAction(s);
  const palette = {};

  if (colors.length) {
    palette.primary = colors[0].hex;
    if (colors[1]) palette.accent = colors[1].hex;
    if (colors[1] && /内|衬|边|滚边|配/.test(s)) palette.secondary = colors[1].hex;
  }

  // White/gold evening requests should not accidentally turn a white dress
  // into a solid white silhouette. Keep the other two roles readable.
  if (outfitId === 'midnight' && colors[0]?.name === 'white') {
    palette.primary = '#dddce6';
    palette.secondary = '#f2efe5';
    palette.accent = colors[1]?.hex || '#c9aa65';
  }

  const removeLayers = [];
  if (/不要外套|脱掉外套|去掉外套|不穿外套/.test(s)) removeLayers.push('cropShell', 'hoodieShell', 'shoulderShell');
  if (/不要长裙|脱掉长裙|去掉长裙|短一点/.test(s)) removeLayers.push('longSkirt', 'sheerOverskirt');
  if (/不要腰带|去掉腰带/.test(s)) removeLayers.push('waistband', 'obi', 'utilityBelt');

  const layers = [];
  if (/加.*长裙|长裙/.test(s) && !removeLayers.includes('longSkirt')) layers.push('longSkirt');
  if (/加.*腰带|束腰/.test(s) && !removeLayers.includes('waistband')) layers.push('waistband');

  const explicitColor = colors.length > 0;
  const hasLookSignal = !!outfitId || explicitColor || removeLayers.length || layers.length;
  const id = outfitId || (explicitColor && /和|浴衣|粉/.test(s) ? 'sakura' : currentId);
  const preset = OUTFITS[id] || OUTFITS.formula;

  return {
    raw: text,
    clean: s,
    outfitId: id,
    outfitChanged: !!outfitId || id !== currentId,
    palette: Object.keys(palette).length ? palette : null,
    action,
    layers,
    removeLayers,
    hasLookSignal,
    preset,
  };
}

export function intentReply(intent, wardrobe) {
  const p = wardrobe?.palette || intent.preset.palette;
  const colorName = (hex) => {
    if (!hex) return '';
    const rgb = hex.replace('#', '').match(/../g).map((v) => parseInt(v, 16));
    const [r, g, b] = rgb;
    if (r < 55 && g < 55 && b < 55) return '墨黑';
    if (r > 210 && g > 205 && b > 195) return '月白';
    if (r > 190 && g > 170 && b > 145 && r > b + 18) return '奶油';
    if (r > 175 && g > 150 && b < 150) return '奶油';
    if (r > g + 20 && b > g - 8) return '灰粉';
    if (b > r + 18) return '雾蓝';
    if (g > r + 12) return '薄荷';
    if (r > 160 && g > 120 && b < 120) return '暖金';
    return '低饱和';
  };

  const fabrics = {
    formula: '挺括胸衣与轻亮袖套',
    midnight: '垂坠长裙与冷银领面',
    sakura: '宽袖与束腰',
    cyber: '短夹克与机能腰封',
    lounge: '松软针织上衣',
    stage: '薄纱层叠与金线腰身',
  };
  const actionText = {
    spin: '，我会慢慢转一圈给你看',
    turn: '，转过去让你看背面',
    wave: '，顺便和你打个招呼',
    dance: '，动起来时裙摆会跟着走',
    stretch: '，伸个懒腰放松一下',
    pose: '，给你一个定格姿势',
    idle: '，先安静站好',
  }[intent.action] || '';
  return `换好了：${intent.preset.name}，${colorName(p.primary)}${fabrics[intent.preset.id]}${actionText}。`;
}

export function suggestionSet() {
  return [
    '换成粉色的樱花和装',
    '黑金午夜礼装，再转一圈',
    '蓝色机能短夹克，挥挥手',
    '米白居家卫衣，站好',
    '月白舞台长裙，摆个姿势',
  ];
}
