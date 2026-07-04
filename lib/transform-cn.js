'use strict';

// 句型转换参考答案的中文译文：优先用步骤数据里的 cn，否则按步骤类型与原句推导。

function stripEnd(s) {
  return String(s || '').replace(/[。！？!?]$/, '');
}

function endsWithMa(cn) {
  return /[吗呢吧]$/.test(stripEnd(cn)) || cn.includes('吗');
}

// 一般疑问句 ↔ 陈述句
function toYesNoCn(cn, prompt) {
  const p = prompt || '';
  const s = stripEnd(cn);
  if (/陈述句/.test(p)) {
    return s.replace(/吗$/, '') + '。';
  }
  if (endsWithMa(cn)) return cn;
  return s + '吗？';
}

// 否定句
function toNegativeCn(cn, prompt) {
  const p = prompt || '';
  let s = stripEnd(cn);
  if (/否定回答|不是我的|不是他的|不是她的/.test(p)) {
    if (/雨伞/.test(s)) return '不，这不是我的雨伞。';
    if (/衬衫/.test(s)) return '不，这不是我的衬衫。';
    if (/书/.test(s) && /那/.test(s)) return '不，那不是我的书。';
    return '不，不是。';
  }
  if (/祈使/.test(p)) {
    if (/请给/.test(s)) return '请不要给我那本书。';
    if (/别/.test(s)) return s.replace(/^别/, '不要') + '。';
    if (/向左/.test(s)) return '不要向左转，不要一直往前走。';
    return '不要' + s + '。';
  }
  if (/not…enough|太小/.test(p)) return '这件裙子不够大。';
  if (/太肯定/.test(p)) return '他太肯定了。';
  if (/正在小心/.test(p)) return '他们正在小心地搬它。';
  if (s.includes('正在')) return s.replace('正在', '没有在') + '。';
  if (s.includes('已经')) return s.replace('已经', '还没有') + '。';
  if (s.includes('刚刚')) return s.replace('刚刚', '还没有') + '。';
  if (s.includes('打算')) return s.replace('打算', '不打算') + '。';
  if (s.includes('必须')) return s.replace('必须', '不必') + '。';
  if (s.includes('可以')) return s.replace('可以', '不可以') + '。';
  if (s.includes('能够')) return s.replace('能够', '不能') + '。';
  if (/[^不]能/.test(s)) return s.replace(/([^不])能/, '$1不能') + '。';
  if (s.includes('会')) return s.replace(/([^不])会/, '$1不会') + '。';
  if (s.includes('将')) return s.replace(/([^不])将/, '$1不会') + '。';
  if (s.includes('要') && !s.includes('不要')) return s.replace(/([^不])要/, '$1不要') + '。';
  if (/不必取消/.test(p) || s.includes('不得不')) return s.replace('不得不', '不必') + '。';
  if (/玩得很/.test(s)) return s.replace('很', '不太') + '。';
  if (/称/.test(s)) return s.replace(/称/, '不称') + '。';
  if (/保存得/.test(s)) return s.replace('保存得', '没有保存得') + '。';
  if (/把/.test(s)) return s.replace(/把/, '没有把') + '。';
  if (/被/.test(s)) {
    if (/已被/.test(s)) return s.replace('已被', '没有被') + '。';
    if (/被/.test(s)) return s.replace(/被/, '没有被') + '。';
  }
  if (s.includes('比')) return s.replace(/更/, '不更') + '。'; // 粗略：Tom 不比 Jim 高
  if (s.includes('建于')) return s.replace('建于', '不是建于') + '。';
  if (s.includes('喜欢')) return s.replace('喜欢', '不喜欢') + '。';
  if (s.includes('听到')) return s.replace('听到', '没有听到') + '。';
  if (s.includes('打翻')) return s.replace('把', '没有把') + '。';
  if (s.includes('常常')) return s.replace('常常', '不常') + '。';
  if (s.includes('是')) return s.replace(/([^不])是/, '$1不是') + '。';
  if (s.includes('在') && !s.includes('正在')) return s.replace(/([^不])在/, '$1不在') + '。';
  if (s.includes('有')) return s.replace(/([^没])有/, '$1没有') + '。';
  const m = /^(你|我|他|她|它|我们|你们|他们|孩子们|汤姆|吉姆|老板|警察|国王|医生|牙医|店主|萨莉|伊恩|汤米)(.{0,12}?)([\u4e00-\u9fff]+)/.exec(s);
  if (m && !m[2].includes('不')) return m[1] + m[2] + '不' + m[3] + (s.slice(m[0].length) || '') + '。';
  return '';
}

function toWhCn(cn, prompt) {
  const p = prompt || '';
  const s = stripEnd(cn);

  if (/问["「]是什么["」]/.test(p)) {
    if (/这是/.test(s)) return '这是什么？';
    if (/那是/.test(s)) return '那是什么？';
    return '这是什么？';
  }
  if (/问["「]有什么["」]/.test(p)) {
    const loc = s.match(/在(.+?)有/) || s.match(/(.+?)上有/);
    if (loc) return (loc[1] || s) + '有什么？';
    return s + '有什么？';
  }
  if (/问["「]谁["」]/.test(p)) {
    if (/谁很好/.test(p)) return '谁很好？';
    if (/在做什么|在打什么/.test(p)) {
      const act = s.match(/正在(.+)/);
      return act ? '谁在' + act[1] + '？' : '谁在' + s + '？';
    }
    const job = s.match(/是(?:一名|一个|一位)?(.+)/);
    if (job) return '谁是' + job[1].replace(/吗$/, '') + '？';
    return '谁' + s + '？';
  }
  if (/问国籍/.test(p)) {
    const sub = s.match(/^(.+?)是/) || ['', '她'];
    return sub[1] + '是哪国人？';
  }
  if (/问职业/.test(p)) {
    const sub = s.match(/^(.+?)(?:是|在)/) || ['', '他'];
    return sub[1] + '是做什么的？';
  }
  if (/问颜色/.test(p)) {
    const sub = s.match(/^(.+?)是/) || ['', '它'];
    return sub[1] + '是什么颜色的？';
  }
  if (/问地点/.test(p)) {
    if (/将|要|打算/.test(s)) {
      const sub = s.match(/^(.+?)(?:将|要|打算)/) || ['', '他们'];
      return sub[1] + '要去哪里？';
    }
    if (/坐落|在/.test(s)) {
      const sub = s.match(/^(.+?)(?:坐落|在)/) || s.match(/有(.+?)在/);
      if (sub) return (sub[1] || '它') + '在哪里？';
    }
    return s + '在哪里？';
  }
  if (/问时间/.test(p)) {
    if (/将|要|打算/.test(s)) return '他们什么时候去北京？';
    return '什么时候' + s + '？';
  }
  if (/问数量/.test(p)) {
    if (/画/.test(s)) return '墙上有多少幅画？';
    if (/椅子/.test(s)) return '房间里有多少把椅子？';
    return s + '有多少？';
  }
  if (/问频率/.test(p)) return '他多久打一次电话？';
  if (/在做什么/.test(p)) {
    const sub = s.match(/^(.+?)正在(.+)/);
    return sub ? sub[1] + '在做什么？' : '在做什么？';
  }
  if (/在打什么/.test(p)) return '她在打什么？';
  if (/完成了什么/.test(p)) return '你完成了什么？';
  if (/当时在做什么/.test(p)) return '他当时在看什么？';
  if (/买了什么/.test(p)) return '他买了什么？';
  if (/喝什么/.test(p)) return '她喝什么？';
  if (/要什么/.test(p)) return '你要什么？';
  if (/还要什么/.test(p)) return '你还要什么？';
  if (/必须做什么/.test(p)) return '我必须做什么？';
  if (/打算做什么/.test(p)) return '你打算做什么？';
  if (/去过哪里/.test(p)) return '她去过哪里？';
  if (/whose|谁的/.test(p.toLowerCase())) {
    if (/衬衫/.test(s)) return '这是谁的衬衫？';
    if (/手提包/.test(s)) return '这是谁的手提包？';
    return '这是谁的？';
  }
  if (/which|哪一个/.test(p.toLowerCase())) return '请问是哪一本？';
  if (/感觉怎样|怎么样/.test(p)) return '孩子们感觉怎么样？';
  if (/多久了/.test(p)) return '他拥有这辆车多久了？';
  if (/祈使/.test(p)) return '我不应该做什么？';
  if (/被动/.test(p)) return '这座桥是什么时候建的？';

  // 通用兜底：从 prompt 提取提问意图
  const subj = (s.match(/^(.+?)(?:正在|已经|要|将|打算|是|在|把|给)/) || ['', ''])[1] || '';
  const quoted = /问["「]([^"」]+)["」]/.exec(p);
  if (quoted) {
    const q = quoted[1];
    if (/谁/.test(q)) return q + '？';
    if (/什么/.test(q)) return (subj || '他') + q + '？';
    return q + '？';
  }
  if (/问时刻|问"何时/.test(p)) return (subj || '他') + '几点' + (s.match(/起床|开始/) ? '起床' : '') + '？';
  if (/问时间/.test(p)) return (subj || '他们') + '什么时候' + s.replace(/^[^，。]+[，。]?/, '') + '？';
  if (/问地点/.test(p)) return (subj || '它') + '在哪里？';
  if (/问"向哪/.test(p) || /向哪边/.test(p)) return '向哪边转？';
  if (/怎样/.test(p)) return (subj || '它') + '怎么样？';
  if (/什么型号/.test(p)) return '是什么型号？';
  if (/会说什么/.test(p)) return (subj || '她') + '会说什么？';
  if (/谁更高|哪个更热/.test(p)) return p.includes('更热') ? '夏天和春天哪个更热？' : '谁更高？';
  if (/何时好转/.test(p)) return '她什么时候好转？';
  if (/何时来客人/.test(p)) return '我们什么时候来客人？';
  if (/收拾了什么/.test(p)) return '他们收拾了什么？';
  if (/何时在过马路/.test(p)) return '车祸发生时他在做什么？';
  if (/谁搬走了/.test(p)) return '谁搬走了？';
  if (/将粉刷什么/.test(p)) return '他们将粉刷什么？';
  if (/在哪里下车/.test(p)) return '在哪里下车？';
  if (/弄伤了什么/.test(p)) return '弄伤了什么？';
  if (/做完了什么/.test(p)) return '你做完什么了吗？';
  if (/在哪里野餐/.test(p)) return '在哪里野餐？';
  if (/打翻了什么/.test(p)) return '打翻了什么？';
  if (/买什么/.test(p)) return (subj || '她') + '买什么？';
  if (/说什么/.test(p)) return (subj || '他') + '说了什么？';
  if (/多久/.test(p)) return (subj || '他') + '多久了？';
  if (/多少/.test(p)) return '有多少？';
  if (/从哪里/.test(p)) return '从哪里？';
  if (/为什么/.test(p)) return '为什么？';
  if (/how often|频率/.test(p.toLowerCase())) return (subj || '他') + '多久一次？';
  return '';
}

function toPassiveCn(cn, prompt) {
  const s = stripEnd(cn);
  if (/新学校/.test(s)) return '一所新学校去年被他们建了。';
  if (/英语/.test(s)) return '英语在全世界被说。';
  if (/桥/.test(s)) return '这座桥建于 1960 年。';
  if (/货物/.test(s)) return '货物被搬到了另一艘船上。';
  if (/地板/.test(s)) return '地板被店主请人重修了。';
  if (/SOS/.test(s)) return '一条 SOS 求救信息被立刻发出。';
  if (/器械/.test(s)) return '相关器械在手术开始前已经消毒完毕。';
  if (/水晶宫/.test(s)) return '水晶宫是为博览会而建的。';
  if (/自由女神/.test(s)) return '自由女神像是在法国制造后运到美国组装的。';
  if (/大鱼/.test(s)) return '这条大鱼已经被切分处理了。';
  if (/店铺/.test(s)) return '店铺被认为将会彻底倒闭。';
  if (/牌子/.test(s)) return '禁止停车的牌子已经被竖起来了。';
  if (/酒馆/.test(s)) return '这家酒馆已被一位新主人买下。';
  if (/金属板/.test(s)) return '那块金属板已经被敲击了。';
  if (/关键部件/.test(s)) return '关键部件在降下之前已被起重机吊起。';
  return s + '（被动语态）';
}

function toIndirectCn(cn, prompt) {
  const s = stripEnd(cn);
  if (/很忙/.test(s)) return '他说他很忙。';
  if (/明天会来/.test(s)) return '她说她明天会来。';
  if (/感觉好/.test(s)) return '医生问我是否感觉好些了。';
  if (/说错话/.test(s)) return '部长说他只是说错了话。';
  if (/剧院/.test(s)) return '他坚持说自己案发时正在剧院看戏。';
  if (/从没想过/.test(s)) return '妻子告诉警官她从没想过丈夫会做这种事。';
  if (/是否/.test(s)) return '牙医问我刚才是否想对他说什么。';
  if (/英语/.test(s)) return '我想知道他是否会说英语。';
  return '他说' + s + '。';
}

/** 返回该步骤参考答案对应的中文译文 */
function answerCn(exercise, step) {
  if (step.cn) return step.cn;
  const cn = exercise && exercise.cn;
  if (!cn) return '';
  switch (step.kind) {
    case 'translate': return cn;
    case 'yesno': return toYesNoCn(cn, step.prompt);
    case 'negative': return toNegativeCn(cn, step.prompt);
    case 'wh': return toWhCn(cn, step.prompt);
    case 'passive': return toPassiveCn(cn, step.prompt);
    case 'indirect': return toIndirectCn(cn, step.prompt);
    default: return '';
  }
}

module.exports = { answerCn, toYesNoCn, toNegativeCn, toWhCn };
