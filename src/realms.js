// The five realms of Cindral: look, sound, enemies, boss and the gift each
// warden guards. Order is the order of play.
export const REALMS = [
  {
    id: 0, key: 'moss', name: 'Bois de Mousseveille', sub: "Là où la forêt dort debout",
    song: 'realm1', style: 'earth', fx: 'leaves',
    sky: [[0, 64, 96, 140], [0.5, 220, 150, 120], [0.8, 248, 200, 140], [1, 255, 230, 170]],
    ground: '#6b4a3a', top: '#5fa040', accent: '#a7d26a', plat: '#8a5a34', deep: '#2a1a24',
    enemies: ['mossling', 'sporebat', 'bramble'], boss: 'thornback', gift: 'double',
    giftName: 'Plume du Vent', giftText: 'Double saut : sautez en plein vol.',
    node: [300, 760], seed: 101, len: 200, ceiling: 0,
  },
  {
    id: 1, key: 'aqua', name: 'Aqueduc Englouti', sub: 'Les cloches y sonnent sous l’eau',
    song: 'realm2', style: 'brick', fx: 'water',
    sky: [[0, 10, 30, 50], [0.6, 30, 80, 100], [1, 70, 140, 150]],
    ground: '#5a6a7a', top: '#4f9a8a', accent: '#8fd8c8', plat: '#7a8a9a', deep: '#101828',
    enemies: ['jelly', 'crab', 'drip'], boss: 'vesper', gift: 'dash',
    giftName: 'Écaille du Courant', giftText: 'Dash : C / bouton B, même en l’air.',
    node: [620, 540], seed: 202, len: 210, ceiling: 1,
  },
  {
    id: 2, key: 'dune', name: 'Dunes de Verre', sub: 'Le soleil s’y est brisé le premier',
    song: 'realm3', style: 'strata', fx: 'heat',
    sky: [[0, 120, 60, 90], [0.45, 240, 140, 80], [0.8, 255, 210, 120], [1, 255, 240, 190]],
    ground: '#c08850', top: '#f0c070', accent: '#9ae0f0', plat: '#a07040', deep: '#40202c',
    enemies: ['skink', 'wasp', 'wraith'], boss: 'colossus', gift: 'wall',
    giftName: 'Griffe de Sable', giftText: 'Saut mural : glissez sur un mur, puis sautez.',
    node: [880, 820], seed: 303, len: 220, ceiling: 0,
  },
  {
    id: 3, key: 'gear', name: 'Flèche des Rouages', sub: 'Une horloge plus vieille que le temps',
    song: 'realm4', style: 'metal', fx: 'gears',
    sky: [[0, 30, 16, 20], [0.5, 90, 48, 36], [1, 160, 90, 50]],
    ground: '#7a6048', top: '#c09040', accent: '#ffd070', plat: '#9a7a50', deep: '#1c1014',
    enemies: ['sentry', 'hopper', 'roller'], boss: 'horologe', gift: 'shot',
    giftName: 'Cœur d’Horloge', giftText: 'Tir solaire : maintenez V / bouton Y, relâchez.',
    node: [560, 250], seed: 404, len: 220, ceiling: 1,
  },
  {
    id: 4, key: 'void', name: 'Citadelle de l’Éclipse', sub: 'Le dernier éclat attend dans la nuit',
    song: 'realm5', style: 'crystal', fx: 'eclipse',
    sky: [[0, 8, 4, 20], [0.6, 40, 16, 60], [1, 90, 30, 90]],
    ground: '#4a3a6a', top: '#8a6ac0', accent: '#ff7ab0', plat: '#6a5a8a', deep: '#0c0818',
    enemies: ['knight', 'eye', 'hound'], boss: 'eclipse', gift: null,
    giftName: 'Cloche-Soleil', giftText: '',
    node: [200, 260], seed: 505, len: 230, ceiling: 0,
  },
];
