/**
 * Seed realistic conversation sessions for the logged-in user.
 * Run with: npx tsx scripts/seed-sessions.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SESSIONS = [
  {
    mode: 'conversation',
    durationSeconds: 480,
    daysAgo: 0,
    plan: {
      topic: 'Ordering ramen at a busy Tokyo counter',
      persona: { relationship: 'ramen shop owner', personality: 'friendly but busy' },
      register: 'casual',
      tone: 'lighthearted',
    },
    transcript: [
      { role: 'assistant', content: 'いらっしゃいませ！何にしますか？うちは味噌ラーメンが一番人気ですよ。' },
      { role: 'user', content: '味噌ラーメンをください。大盛りできますか？' },
      { role: 'assistant', content: 'もちろん！大盛り、プラス100円になります。トッピングはどうしますか？煮卵、チャーシュー、ネギとかありますけど。' },
      { role: 'user', content: '煮卵とネギをお願いします。あと、辛いのはありますか？' },
      { role: 'assistant', content: 'ありますよ！激辛味噌ラーメンもあります。でも、本当に辛いですよ（笑）。普通の味噌に辛味噌を少し足すこともできますけど。' },
      { role: 'user', content: '普通の味噌に辛味噌を少し足してください。激辛はちょっと怖いです。' },
      { role: 'assistant', content: 'はい、了解です！味噌ラーメン大盛り、煮卵とネギ付き、辛味噌ちょい足しですね。少々お待ちください！' },
      { role: 'user', content: 'あと、お水もお願いします。' },
      { role: 'assistant', content: 'はいどうぞ。お水はそこのセルフサービスです。コップはカウンターの下にありますよ。' },
      { role: 'user', content: 'ありがとうございます。このラーメン屋さんは何年やっていますか？' },
      { role: 'assistant', content: 'もう15年になりますね。最初は小さい店だったけど、今はお客さんがたくさん来てくれて嬉しいです。お待たせしました、どうぞ！' },
      { role: 'user', content: 'わあ、美味しそう！いただきます！' },
    ],
  },
  {
    mode: 'conversation',
    durationSeconds: 600,
    daysAgo: 1,
    plan: {
      topic: 'Planning a weekend trip to Kyoto with a friend',
      persona: { relationship: 'close friend', personality: 'enthusiastic and organized' },
      register: 'casual',
      tone: 'excited',
    },
    transcript: [
      { role: 'assistant', content: 'ねえ、今度の週末、京都に行かない？紅葉がきれいな時期だよ！' },
      { role: 'user', content: 'いいね！行きたい。でも、どこに泊まる？ホテルは高いかな。' },
      { role: 'assistant', content: '旅館はどう？伝統的な日本の旅館に泊まってみたいって前に言ってたよね。嵐山の近くにいいところがあるみたい。' },
      { role: 'user', content: '旅館がいいですね。嵐山の竹林も見たいです。' },
      { role: 'assistant', content: '竹林いいよね～！朝早く行くと人が少なくてきれいだよ。あと、金閣寺と伏見稲荷もどう？' },
      { role: 'user', content: '伏見稲荷に行きたい！千本鳥居を見たいです。写真をたくさん撮りたい。' },
      { role: 'assistant', content: '千本鳥居は本当にすごいよ！上まで登ると2時間くらいかかるけど、景色が最高だよ。' },
      { role: 'user', content: '2時間は長いですね。途中まででもいいかな。電車で京都まで何時間かかりますか？' },
      { role: 'assistant', content: '新幹線だと2時間くらいかな。朝早い新幹線で行けば、お昼には着くよ。チケットは早めに買ったほうがいいよ。' },
      { role: 'user', content: 'わかった。じゃあ、来週の金曜日に予約しよう。楽しみ！' },
      { role: 'assistant', content: 'うん！あ、京都の抹茶スイーツも絶対食べようね。宇治の抹茶パフェが有名だよ。' },
      { role: 'user', content: '抹茶パフェ！大好きです。お土産も買いたいな。八つ橋とか。' },
      { role: 'assistant', content: '八つ橋いいね。生八つ橋のほうが美味しいよ。色んな味があって、抹茶味とイチゴ味がおすすめ！' },
      { role: 'user', content: '生八つ橋を食べたことがないから、楽しみです！' },
    ],
  },
  {
    mode: 'tutor',
    durationSeconds: 540,
    daysAgo: 2,
    plan: {
      topic: 'て-form conjugation and common uses',
      objective: 'Conjugate and use te-form in 3 sentence patterns',
      steps: [
        { title: 'Warm-up', type: 'activate', status: 'completed' },
        { title: 'Explanation', type: 'explain', status: 'completed' },
        { title: 'Practice', type: 'practice', status: 'completed' },
      ],
      concepts: [{ label: 'て-form', type: 'grammar' }],
    },
    transcript: [
      { role: 'assistant', content: '今日はて形（て-form）を練習しましょう！て形は日本語でとても大切な文法です。まず、知っていることを教えてください。て形を使ったことがありますか？' },
      { role: 'user', content: 'はい、少し知っています。「食べて」とか「飲んで」は知っています。' },
      { role: 'assistant', content: 'いいですね！じゃあ、基本的なルールを確認しましょう。\n\n**グループ1（五段動詞）**のて形:\n- 書く → 書いて\n- 泳ぐ → 泳いで\n- 話す → 話して\n- 待つ → 待って\n- 読む → 読んで\n\n**グループ2（一段動詞）**は簡単です:\n- 食べる → 食べて\n- 見る → 見て\n\nでは、「飲む」のて形は何ですか？' },
      { role: 'user', content: '飲む → 飲んで ですか？' },
      { role: 'assistant', content: '正解です！「む」で終わる動詞は「んで」になりますね。では、「行く」のて形は？これは特別な形です。' },
      { role: 'user', content: '行く → 行いて？' },
      { role: 'assistant', content: '惜しい！「行く」は特別で、「行って」になります。「く」で終わる動詞は普通「いて」ですが、「行く」だけは「行って」です。覚えましょう！\n\nでは、て形の使い方を3つ練習しましょう：\n1. ～てください（please do ～）\n2. ～ている（be doing ～）\n3. ～てから（after doing ～）' },
      { role: 'user', content: '窓を開けてください。今、本を読んでいます。ご飯を食べてから、勉強します。' },
      { role: 'assistant', content: '完璧です！3つとも正しいですよ。特に「ご飯を食べてから、勉強します」は自然な日本語です。素晴らしい！\n\nもう一つ練習しましょう。「朝起きて、シャワーを浴びて、朝ごはんを食べます」のように、て形で動作をつなげることもできます。あなたの朝のルーティンを教えてください。' },
      { role: 'user', content: '朝起きて、コーヒーを飲んで、ニュースを読んで、仕事に行きます。' },
      { role: 'assistant', content: '素晴らしい！全部正しいです。て形をとても上手に使えていますよ。「行きます」を使うと特別なて形「行って」になることを覚えておいてくださいね。今日のレッスンはここまでです。よく頑張りました！' },
    ],
  },
  {
    mode: 'conversation',
    durationSeconds: 420,
    daysAgo: 3,
    plan: {
      topic: 'Asking for directions at a train station',
      persona: { relationship: 'helpful station staff', personality: 'patient and polite' },
      register: 'polite',
      tone: 'helpful',
    },
    transcript: [
      { role: 'user', content: 'すみません、渋谷駅はどこですか？' },
      { role: 'assistant', content: 'はい、渋谷駅ですね。ここから山手線で3つ目の駅です。2番線ホームから乗ってください。' },
      { role: 'user', content: '2番線ホームはどこにありますか？' },
      { role: 'assistant', content: 'あちらの階段を降りて、左に曲がってください。「山手線 外回り」の看板が見えますよ。' },
      { role: 'user', content: 'ありがとうございます。切符はどこで買えますか？' },
      { role: 'assistant', content: '券売機はあちらにあります。でも、ICカードはお持ちですか？SuicaやPASMOがあれば、そのまま改札を通れますよ。' },
      { role: 'user', content: 'Suicaを持っています。チャージは十分かな...。チャージする場所はありますか？' },
      { role: 'assistant', content: '券売機でチャージできますよ。残高を確認して、足りなければチャージしてくださいね。渋谷までは170円です。' },
      { role: 'user', content: 'わかりました。渋谷まで何分ぐらいかかりますか？' },
      { role: 'assistant', content: 'だいたい7分くらいです。次の電車は3分後に来ますよ。お急ぎですか？' },
      { role: 'user', content: 'いいえ、大丈夫です。ありがとうございました！' },
      { role: 'assistant', content: 'いいえ、どういたしまして。良い一日を！渋谷は混んでいますから、お気をつけて。' },
    ],
  },
  {
    mode: 'conversation',
    durationSeconds: 360,
    daysAgo: 5,
    plan: {
      topic: 'Talking about hobbies at a language exchange meetup',
      persona: { relationship: 'new acquaintance', personality: 'curious and friendly' },
      register: 'polite',
      tone: 'warm',
    },
    transcript: [
      { role: 'assistant', content: 'はじめまして！田中です。今日は言語交換のイベントに来たんですね。趣味は何ですか？' },
      { role: 'user', content: 'はじめまして。趣味は音楽を聞くことと、料理することです。' },
      { role: 'assistant', content: '料理！いいですね。どんな料理を作りますか？日本料理も作りますか？' },
      { role: 'user', content: 'はい、日本料理が好きです。先週、カレーライスを作りました。でも、味噌汁はまだ難しいです。' },
      { role: 'assistant', content: '味噌汁は簡単そうに見えるけど、出汁が大事ですよね。どんな音楽を聞きますか？' },
      { role: 'user', content: 'J-POPが好きです。YOASOBIとか藤井風とか。日本語の歌を聞くと、リスニングの練習にもなります。' },
      { role: 'assistant', content: 'YOASOBIは人気ですよね！「夜に駆ける」は知っていますか？あの歌の歌詞は結構難しいですよ。' },
      { role: 'user', content: 'はい、知っています！歌詞は全部わかりませんが、メロディがきれいです。カラオケで歌いたいです。' },
      { role: 'assistant', content: 'カラオケ行きましょうよ！日本語の歌を歌うのは本当にいい練習になりますよ。来週の土曜日はどうですか？' },
      { role: 'user', content: '来週の土曜日はいいです！行きましょう。楽しみにしています。' },
    ],
  },
  {
    mode: 'conversation',
    durationSeconds: 300,
    daysAgo: 7,
    plan: {
      topic: 'Casual conversation about trying new ramen spots',
      persona: { relationship: 'coworker', personality: 'foodie' },
      register: 'casual',
      tone: 'relaxed',
    },
    transcript: [
      { role: 'assistant', content: 'ねえ、昨日新しいラーメン屋に行ったんだけど、めっちゃ美味しかった！' },
      { role: 'user', content: '本当？どこのラーメン屋？' },
      { role: 'assistant', content: '新宿の南口の近くにあるの。豚骨ラーメンが有名で、スープが濃厚でクリーミーだったよ。' },
      { role: 'user', content: '豚骨ラーメンが好きです。私も行きたい。名前は何ですか？' },
      { role: 'assistant', content: '「麺屋 一燈」って言うの。食べログで4.2点だよ。行列ができるけど、平日のお昼なら30分くらいで入れるよ。' },
      { role: 'user', content: '来週の昼休みに行こう。一緒に行きますか？' },
      { role: 'assistant', content: 'いいよ！水曜日はどう？あ、でも水曜日は定休日かも。確認しておくね。' },
      { role: 'user', content: 'ありがとう。木曜日も大丈夫です。' },
    ],
  },
]

async function main() {
  // Find the first user with a learner profile
  const profile = await prisma.learnerProfile.findFirst({
    orderBy: { createdAt: 'desc' },
  })

  if (!profile) {
    console.error('No learner profile found. Please complete onboarding first.')
    process.exit(1)
  }

  const userId = profile.userId
  console.log(`Seeding sessions for user: ${userId}\n`)

  for (const session of SESSIONS) {
    const timestamp = new Date()
    timestamp.setDate(timestamp.getDate() - session.daysAgo)
    timestamp.setHours(10 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60))

    const transcript = session.transcript.map((m) => ({
      ...m,
      timestamp: new Date(timestamp.getTime() + Math.random() * session.durationSeconds * 1000).toISOString(),
    }))

    const created = await prisma.conversationSession.create({
      data: {
        userId,
        mode: session.mode,
        timestamp,
        durationSeconds: session.durationSeconds,
        transcript,
        targetsPlanned: {},
        targetsHit: [],
        errorsLogged: [],
        avoidanceEvents: [],
        sessionPlan: session.plan,
        systemPrompt: null,
      },
    })

    console.log(`  Created: "${session.plan.topic}" (${session.mode}, ${Math.round(session.durationSeconds / 60)}m, ${session.daysAgo}d ago) → ${created.id}`)
  }

  // Update profile stats
  await prisma.learnerProfile.update({
    where: { userId },
    data: {
      totalSessions: { increment: SESSIONS.length },
      currentStreak: 4,
    },
  })

  console.log(`\nSeeded ${SESSIONS.length} sessions!`)
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
