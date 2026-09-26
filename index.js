const { Telegraf, Markup } = require('telegraf');

// بيانات البوت وقاعدة البيانات
const BOT_TOKEN = '8923884794:AAE4bVSm2uYSUuiaRlB-Q9kfk6RXjy9VkYw';
const ADMIN_ID = 5888457390;
const CHANNEL_ID = -1003788634048;
const DB_URL = 'https://slp8-bot-default-rtdb.firebaseio.com';

const bot = new Telegraf(BOT_TOKEN);

// دوال مساعدة للتواصل مع Firebase
async function getDbData(path) {
  try {
    const res = await fetch(${DB_URL}/${path}.json);
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function setDbData(path, data) {
  try {
    await fetch(${DB_URL}/${path}.json, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (e) {}
}

async function pushDbData(path, data) {
  try {
    await fetch(${DB_URL}/${path}.json, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (e) {}
}

// القائمة الرئيسية (اختيار السنة)
const mainKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🎓 السنة الأولى', 'year_1'), Markup.button.callback('🎓 السنة الثانية', 'year_2')],
  [Markup.button.callback('🎓 السنة الثالثة', 'year_3'), Markup.button.callback('🎓 السنة الرابعة', 'year_4')]
]);

// رسالة البداية
bot.start((ctx) => {
  const welcomeText = مرحباً بك في بوت مساعد قسم تقويم الكلام واللغة 🎙️📚\n\nيسعدنا مساعدتك للوصول إلى المحاضرات، التسجيلات الصوتية، الملخصات، وأسئلة الدورات بكل سهولة.\n\nيرجى اختيار السنة الدراسية:;
  ctx.reply(welcomeText, mainKeyboard);
});

// العودة للقائمة الرئيسية
bot.action('main_menu', (ctx) => {
  ctx.editMessageText('اختر السنة الدراسية:', mainKeyboard);
});

// اختيار السنة وعرض المواد
for (let y = 1; y <= 4; y++) {
  bot.action(year_${y}, async (ctx) => {
    const subjects = await getDbData(subjects/year_${y}) || {};

    const buttons = [];
    Object.keys(subjects).forEach((subKey) => {
      buttons.push([Markup.button.callback(📖 ${subjects[subKey].name}, sub_${y}_${subKey})]);
    });
    buttons.push([Markup.button.callback('🔙 الرجوع للقائمة الرئيسية', 'main_menu')]);

    ctx.editMessageText(📚 مواد السنة ${y}:\nاختر المادة المطلوبة:, Markup.inlineKeyboard(buttons));
  });
}

// عرض أقسام المادة
bot.action(/^sub_(\d+)_(.+)$/, async (ctx) => {
  const year = ctx.match[1];
  const subKey = ctx.match[2];

  const subData = await getDbData(subjects/year_${year}/${subKey});
  const subjectName = subData ? subData.name : 'المادة';

  const typeButtons = Markup.inlineKeyboard([
    [
      Markup.button.callback('📄 محاضرات PDF', files_${year}_${subKey}_lectures),
      Markup.button.callback('🎙️ فويسات', files_${year}_${subKey}_voices)
    ],
    [
      Markup.button.callback('📝 ملخصات', files_${year}_${subKey}_summaries),
      Markup.button.callback('❓ أسئلة دورات', files_${year}_${subKey}_exams)
    ],
    [Markup.button.callback(🔙 الرجوع لمواد السنة ${year}, year_${year})]
  ]);

  ctx.editMessageText(📖 مادة: ${subjectName}\nاختر نوع المحتوى الذي تبحث عنه:, typeButtons);
});

// إرسال الملفات
bot.action(/^files_(\d+)_(.+)_(lectures|voices|summaries|exams)$/, async (ctx) => {
  const year = ctx.match[1];
  const subKey = ctx.match[2];
  const type = ctx.match[3];

  const files = await getDbData(files/year_${year}/${subKey}/${type});

  if (!files) {
    return ctx.answerCbQuery('لا توجد ملفات مرفوعة في هذا القسم حالياً 📭', { show_alert: true });
  }

  ctx.answerCbQuery('جاري تحميل الملفات...');
  Object.values(files).forEach((file) => {
    if (file.type === 'voice' || file.type === 'audio') {
      ctx.replyWithVoice(file.file_id, { caption: file.caption || '' });
    } else {
      ctx.replyWithDocument(file.file_id, { caption: file.caption || '' });
    }
  });
});

// استقبال الملفات تلقائياً من القناة عبر الهاشتاغات
bot.on('channel_post', async (ctx) => {
  const post = ctx.channelPost;
  if (post.chat.id !== CHANNEL_ID) return;
  const text = post.caption  post.text  '';
  
  const yearMatch = text.match(/#سنة_(\d)/);
  const typeLectures = text.includes('#محاضرات');
  const typeVoices = text.includes('#فويسات');
  const typeSummaries = text.includes('#ملخصات');
  const typeExams = text.includes('#دورات');

  if (!yearMatch) return;
  const year = yearMatch[1];

  let fileType = '';
  if (typeLectures) fileType = 'lectures';
  else if (typeVoices) fileType = 'voices';
  else if (typeSummaries) fileType = 'summaries';
  else if (typeExams) fileType = 'exams';

  if (!fileType) return;

  const hashtags = text.match(/#(\u0600-\u06FF\w+)/g) || [];
  let subjectTag = '';
  for (let tag of hashtags) {
    if (!tag.startsWith('#سنة_') && !['#محاضرات', '#فويسات', '#ملخصات', '#دورات'].includes(tag)) {
      subjectTag = tag.replace('#', '');
      break;
    }
  }

  if (!subjectTag) return;

  let fileId = '';
  let category = 'doc';
  if (post.document) {
    fileId = post.document.file_id;
  } else if (post.voice) {
    fileId = post.voice.file_id;
    category = 'voice';
  } else if (post.audio) {
    fileId = post.audio.file_id;
    category = 'audio';
  }

  if (fileId) {
    await pushDbData(files/year_${year}/${subjectTag}/${fileType}, {
      file_id: fileId,
      type: category,
      caption: text
    });
    console.log(تم إضافة ملف جديد تلقائياً للمادة ${subjectTag});
  }
});

// أمر الأدمن لإضافة المواد
bot.command('add_subject', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const args = ctx.message.text.split(' ');
  const year = args[1];
  const subjectName = args.slice(2).join(' ');

  if (!year || !subjectName) {
    return ctx.reply('⚠️ صيغة الأمر خاطئة.\nالاستخدام الصحيح:\n/add_subject 1 تشريح_الجهاز_الصوتي');
  }

  const subKey = subjectName.replace(/\s+/g, '_');
  await setDbData(subjects/year_${year}/${subKey}, {
    name: subjectName
  });

  ctx.reply(✅ تم إضافة مادة (${subjectName}) للسنة ${year} بنجاح!);
});

bot.launch();
console.log('البوت يعمل الآن بنجاح...');
