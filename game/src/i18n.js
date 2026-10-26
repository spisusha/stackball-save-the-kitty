// All visible texts. English by default (ads run worldwide), Russian with ?lang=ru.
const TEXTS = {
  en: {
    save: 'SAVE THE KITTY!',
    goal: 'Save the kitty',
    hold: 'HOLD TO SMASH',
    help: 'HELP!',
    fire: 'FIRE!',
    soClose: 'SO CLOSE!',
    progress: '{p}% done',
    spikes: 'The spikes got you',
    black: 'Watch out for black!',
    tryAgain: 'TRY AGAIN',
    saved: 'KITTY SAVED!',
    levelDone: 'LEVEL {n} COMPLETE!',
    winSub: 'More towers to smash in the game',
    failSub: 'The kitty still needs you',
    classicSub: 'Smash through every tower',
    badge: 'Kitty saved!',
    play: 'PLAY NOW',
    replay: 'Replay',
    concept: 'Unofficial concept, not an Azur Games ad',
    chooseBall: 'CHOOSE YOUR BALL',
    meteor: 'Meteor',
    meteorPerk: '2 rings per hit',
    rocket: 'Rocket',
    rocketPerk: 'Super fast',
    fireball: 'Fireball',
    firePerk: 'Fire after 6',
    meteorToast: 'HEAVY! 2 RINGS PER HIT',
    rocketToast: 'SUPER SPEED!',
    fireToast: 'FIRE COMES SOONER!',
    watch: 'WATCH',
    yourTurn: 'YOUR TURN!',
    restart: 'TAP TO RESTART',
  },
  ru: {
    save: 'СПАСИ КОТИКА!',
    goal: 'Спаси котика',
    hold: 'ДЕРЖИ, ЧТОБЫ РАЗБИТЬ',
    help: 'ПОМОГИ!',
    fire: 'ОГОНЬ!',
    soClose: 'ТАК БЛИЗКО!',
    progress: 'Пройдено {p}%',
    spikes: 'Шипы догнали',
    black: 'Осторожно с чёрным!',
    tryAgain: 'ЕЩЁ РАЗ',
    saved: 'КОТИК СПАСЁН!',
    levelDone: 'УРОВЕНЬ {n} ПРОЙДЕН!',
    winSub: 'В игре ещё много башен',
    failSub: 'Котик всё ещё ждёт тебя',
    classicSub: 'Разбей каждую башню',
    badge: 'Котик спасён!',
    play: 'ИГРАТЬ',
    replay: 'Сыграть ещё',
    concept: 'Неофициальный концепт, не реклама Azur Games',
    chooseBall: 'ВЫБЕРИ ШАР',
    meteor: 'Метеорит',
    meteorPerk: 'Бьёт 2 кольца',
    rocket: 'Ракета',
    rocketPerk: 'Супербыстрая',
    fireball: 'Огненный',
    firePerk: 'Огонь через 6',
    meteorToast: 'ТЯЖЁЛЫЙ! 2 КОЛЬЦА ЗА УДАР',
    rocketToast: 'СУПЕРСКОРОСТЬ!',
    fireToast: 'ОГОНЬ НАСТУПИТ РАНЬШЕ!',
    watch: 'СМОТРИ',
    yourTurn: 'ТЕПЕРЬ ТЫ!',
    restart: 'НАЖМИ, ЧТОБЫ ПЕРЕЗАПУСТИТЬ',
  },
};

const params = new URLSearchParams(location.search);
export const lang = params.get('lang') === 'ru' ? 'ru' : 'en';

export function t(key, vars = {}) {
  let s = TEXTS[lang][key] ?? TEXTS.en[key] ?? key;
  for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
}

// Fills every element that has data-t="key". Uses textContent, never HTML.
export function applyTexts(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
}
