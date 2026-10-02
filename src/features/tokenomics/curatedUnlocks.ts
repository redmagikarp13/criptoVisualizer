import type { TokenCategoryAllocation } from './types';

export interface CuratedTokenProfile {
  coinGeckoId: string;
  name: string;
  maxSupply: number | null;
  approxTotalSupply: number;
  unlockScheduleType: 'cliff' | 'linear' | 'completed' | 'ongoing';
  nextUnlockDayOfMonth?: number; // dia do mês do unlock recorrente (ex: 15 para ENA)
  nextUnlockFixedAmount?: number; // quantidade aproximada liberada por evento
  categories: TokenCategoryAllocation[];
}

export const CURATED_TOKEN_PROFILES: Record<string, CuratedTokenProfile> = {
  ENA: {
    coinGeckoId: 'ethena',
    name: 'Ethena',
    maxSupply: 15_000_000_000,
    approxTotalSupply: 15_000_000_000,
    unlockScheduleType: 'cliff',
    nextUnlockDayOfMonth: 15,
    nextUnlockFixedAmount: 53_600_000,
    categories: [
      { name: 'Desenvolvimento e Equipe', percent: 30, locked: true },
      { name: 'Investidores e VCs', percent: 25, locked: true },
      { name: 'Ecossistema e Reserva', percent: 30, locked: false },
      { name: 'Fundação Ethena', percent: 15, locked: false },
    ],
  },
  ARB: {
    coinGeckoId: 'arbitrum',
    name: 'Arbitrum',
    maxSupply: 10_000_000_000,
    approxTotalSupply: 10_000_000_000,
    unlockScheduleType: 'cliff',
    nextUnlockDayOfMonth: 16,
    nextUnlockFixedAmount: 92_650_000,
    categories: [
      { name: 'Equipe e Conselheiros', percent: 26.9, locked: true },
      { name: 'Investidores', percent: 17.5, locked: true },
      { name: 'Tesouro da DAO', percent: 42.8, locked: false },
      { name: 'Airdrop Comunidade', percent: 12.8, locked: false },
    ],
  },
  SUI: {
    coinGeckoId: 'sui',
    name: 'Sui',
    maxSupply: 10_000_000_000,
    approxTotalSupply: 10_000_000_000,
    unlockScheduleType: 'cliff',
    nextUnlockDayOfMonth: 1,
    nextUnlockFixedAmount: 64_190_000,
    categories: [
      { name: 'Reserva Comunitária', percent: 50, locked: false },
      { name: 'Contribuidores Iniciais', percent: 20, locked: true },
      { name: 'Investidores', percent: 14, locked: true },
      { name: 'Fundação Mysten Labs', percent: 10, locked: true },
      { name: 'Comunidade Stake', percent: 6, locked: false },
    ],
  },
  TIA: {
    coinGeckoId: 'celestia',
    name: 'Celestia',
    maxSupply: null,
    approxTotalSupply: 1_080_000_000,
    unlockScheduleType: 'cliff',
    nextUnlockDayOfMonth: 30,
    nextUnlockFixedAmount: 175_000_000,
    categories: [
      { name: 'Pesquisa e Equipe', percent: 22.7, locked: true },
      { name: 'Investidores Iniciais', percent: 35.6, locked: true },
      { name: 'Incentivos e Comunidade', percent: 41.7, locked: false },
    ],
  },
  OP: {
    coinGeckoId: 'optimism',
    name: 'Optimism',
    maxSupply: 4_294_967_296,
    approxTotalSupply: 4_294_967_296,
    unlockScheduleType: 'cliff',
    nextUnlockDayOfMonth: 30,
    nextUnlockFixedAmount: 31_340_000,
    categories: [
      { name: 'Contribuidores Centrais', percent: 19, locked: true },
      { name: 'Investidores', percent: 17, locked: true },
      { name: 'Fundos do Ecossistema', percent: 25, locked: false },
      { name: 'RetroPGF / Airdrops', percent: 39, locked: false },
    ],
  },
  STRK: {
    coinGeckoId: 'starknet',
    name: 'Starknet',
    maxSupply: 10_000_000_000,
    approxTotalSupply: 10_000_000_000,
    unlockScheduleType: 'cliff',
    nextUnlockDayOfMonth: 15,
    nextUnlockFixedAmount: 64_000_000,
    categories: [
      { name: 'Equipe e Conselheiros', percent: 32.9, locked: true },
      { name: 'Investidores', percent: 17, locked: true },
      { name: 'Fundação Starknet', percent: 50.1, locked: false },
    ],
  },
  APT: {
    coinGeckoId: 'aptos',
    name: 'Aptos',
    maxSupply: null,
    approxTotalSupply: 1_120_000_000,
    unlockScheduleType: 'cliff',
    nextUnlockDayOfMonth: 11,
    nextUnlockFixedAmount: 11_310_000,
    categories: [
      { name: 'Contribuidores Centrais', percent: 19, locked: true },
      { name: 'Investidores', percent: 13.5, locked: true },
      { name: 'Comunidade', percent: 51, locked: false },
      { name: 'Fundação', percent: 16.5, locked: false },
    ],
  },
  SOL: {
    coinGeckoId: 'solana',
    name: 'Solana',
    maxSupply: null,
    approxTotalSupply: 590_000_000,
    unlockScheduleType: 'ongoing',
    categories: [
      { name: 'Circulante / Mercado', percent: 84, locked: false },
      { name: 'Staking & Fundação', percent: 16, locked: true },
    ],
  },
  BTC: {
    coinGeckoId: 'bitcoin',
    name: 'Bitcoin',
    maxSupply: 21_000_000,
    approxTotalSupply: 21_000_000,
    unlockScheduleType: 'completed',
    categories: [
      { name: 'Circulante Minerado', percent: 94.2, locked: false },
      { name: 'A Minerável (Halvings)', percent: 5.8, locked: true },
    ],
  },
  ETH: {
    coinGeckoId: 'ethereum',
    name: 'Ethereum',
    maxSupply: null,
    approxTotalSupply: 120_200_000,
    unlockScheduleType: 'completed',
    categories: [
      { name: 'Circulante 100% Desbloqueado', percent: 100, locked: false },
    ],
  },
  DOGE: {
    coinGeckoId: 'dogecoin',
    name: 'Dogecoin',
    maxSupply: null,
    approxTotalSupply: 147_000_000_000,
    unlockScheduleType: 'completed',
    categories: [
      { name: 'Circulante 100%', percent: 100, locked: false },
    ],
  },
  XRP: {
    coinGeckoId: 'ripple',
    name: 'XRP',
    maxSupply: 100_000_000_000,
    approxTotalSupply: 100_000_000_000,
    unlockScheduleType: 'cliff',
    nextUnlockDayOfMonth: 1,
    nextUnlockFixedAmount: 1_000_000_000,
    categories: [
      { name: 'Circulante em Mercado', percent: 57, locked: false },
      { name: 'Escrow Mensal Ripple', percent: 43, locked: true },
    ],
  },
  BNB: {
    coinGeckoId: 'binancecoin',
    name: 'BNB',
    maxSupply: 200_000_000,
    approxTotalSupply: 146_000_000,
    unlockScheduleType: 'completed',
    categories: [
      { name: 'Circulante Desbloqueado', percent: 100, locked: false },
    ],
  },
  ADA: {
    coinGeckoId: 'cardano',
    name: 'Cardano',
    maxSupply: 45_000_000_000,
    approxTotalSupply: 45_000_000_000,
    unlockScheduleType: 'ongoing',
    categories: [
      { name: 'Circulante', percent: 80, locked: false },
      { name: 'Reserva Staking', percent: 20, locked: true },
    ],
  },
  AVAX: {
    coinGeckoId: 'avalanche-2',
    name: 'Avalanche',
    maxSupply: 720_000_000,
    approxTotalSupply: 450_000_000,
    unlockScheduleType: 'cliff',
    nextUnlockDayOfMonth: 20,
    nextUnlockFixedAmount: 9_500_000,
    categories: [
      { name: 'Circulante', percent: 58, locked: false },
      { name: 'Staking & Fundação', percent: 42, locked: true },
    ],
  },
  LINK: {
    coinGeckoId: 'chainlink',
    name: 'Chainlink',
    maxSupply: 1_000_000_000,
    approxTotalSupply: 1_000_000_000,
    unlockScheduleType: 'ongoing',
    categories: [
      { name: 'Circulante', percent: 62.7, locked: false },
      { name: 'Reserva Oráculos', percent: 37.3, locked: true },
    ],
  },
  NEAR: {
    coinGeckoId: 'near',
    name: 'NEAR Protocol',
    maxSupply: null,
    approxTotalSupply: 1_220_000_000,
    unlockScheduleType: 'completed',
    categories: [
      { name: 'Circulante Desbloqueado', percent: 99, locked: false },
    ],
  },
  PEPE: {
    coinGeckoId: 'pepe',
    name: 'Pepe',
    maxSupply: 420_690_000_000_000,
    approxTotalSupply: 420_690_000_000_000,
    unlockScheduleType: 'completed',
    categories: [
      { name: 'Circulante 100%', percent: 100, locked: false },
    ],
  },
  WIF: {
    coinGeckoId: 'dogwifcoin',
    name: 'dogwifhat',
    maxSupply: 998_900_000,
    approxTotalSupply: 998_900_000,
    unlockScheduleType: 'completed',
    categories: [
      { name: 'Circulante 100%', percent: 100, locked: false },
    ],
  },
  SEI: {
    coinGeckoId: 'sei-network',
    name: 'Sei',
    maxSupply: 10_000_000_000,
    approxTotalSupply: 10_000_000_000,
    unlockScheduleType: 'cliff',
    nextUnlockDayOfMonth: 15,
    nextUnlockFixedAmount: 125_000_000,
    categories: [
      { name: 'Circulante', percent: 38, locked: false },
      { name: 'Investidores e Fundação', percent: 62, locked: true },
    ],
  },
  WLD: {
    coinGeckoId: 'worldcoin-wld',
    name: 'Worldcoin',
    maxSupply: 10_000_000_000,
    approxTotalSupply: 10_000_000_000,
    unlockScheduleType: 'linear',
    nextUnlockDayOfMonth: 24,
    nextUnlockFixedAmount: 150_000_000,
    categories: [
      { name: 'Circulante', percent: 18, locked: false },
      { name: 'Comunidade & TFH', percent: 82, locked: true },
    ],
  },
  JUP: {
    coinGeckoId: 'jupiter-exchange-solana',
    name: 'Jupiter',
    maxSupply: 10_000_000_000,
    approxTotalSupply: 10_000_000_000,
    unlockScheduleType: 'cliff',
    nextUnlockDayOfMonth: 31,
    nextUnlockFixedAmount: 1_000_000_000,
    categories: [
      { name: 'Circulante', percent: 13.5, locked: false },
      { name: 'Equipe e Tesouro', percent: 86.5, locked: true },
    ],
  },
  DOT: {
    coinGeckoId: 'polkadot',
    name: 'Polkadot',
    maxSupply: null,
    approxTotalSupply: 1_450_000_000,
    unlockScheduleType: 'ongoing',
    categories: [
      { name: 'Circulante Staking', percent: 96, locked: false },
      { name: 'Tesouro', percent: 4, locked: true },
    ],
  },
  INJ: {
    coinGeckoId: 'injective-protocol',
    name: 'Injective',
    maxSupply: 100_000_000,
    approxTotalSupply: 100_000_000,
    unlockScheduleType: 'completed',
    categories: [
      { name: 'Circulante 100%', percent: 100, locked: false },
    ],
  },
};
