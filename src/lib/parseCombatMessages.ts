export type OutgoingOutcome = 'hit' | 'blocked' | 'reflected' | 'instakill' | 'instakill_blocked';
export type IncomingOutcome = 'hit' | 'blocked' | 'reflected_back' | 'instakill' | 'instakill_blocked';

export interface OutgoingCombat {
  target: string;
  outcome: OutgoingOutcome;
  attackerDied: boolean;
}

export interface IncomingCombat {
  attacker: string | null; // null = anonymous
  outcome: IncomingOutcome;
  attackerDied: boolean;
  damage?: number; // HP lost (only set for 'hit')
}

export interface ParsedCombat {
  outgoing?: OutgoingCombat;
  incoming: IncomingCombat[];
  witnessedEliminations: Array<{ attacker: string; victim: string }>;
}

export function parseCombatMessages(messages: string[][]): ParsedCombat {
  const lines = messages.flat();
  const result: ParsedCombat = { incoming: [], witnessedEliminations: [] };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // ── OUTGOING: I attacked someone ────────────────────────────────────────

    // "⚔ You attacked <target>. Your attack was blocked. 🛡"
    const outBlockMatch = line.match(/^⚔ You attacked (.+)\. Your attack was blocked\. 🛡$/);
    if (outBlockMatch) {
      result.outgoing = { target: outBlockMatch[1], outcome: 'blocked', attackerDied: false };
      i++;
      if (i < lines.length && lines[i].startsWith('💥 AND reflected.')) {
        result.outgoing.outcome = 'reflected';
        i++;
        if (i < lines.length && lines[i] === '💀 You died. 💀') {
          result.outgoing.attackerDied = true;
          i++;
        }
      }
      continue;
    }

    // "⚔ You attacked <target>. <target> lost ❤<dmg>."
    const outHitMatch = line.match(/^⚔ You attacked (.+)\. .+ lost ❤\d+\.$/);
    if (outHitMatch) {
      result.outgoing = { target: outHitMatch[1], outcome: 'hit', attackerDied: false };
      i++;
      continue;
    }

    // "💀 You eliminated <target>. You receive their 💰(<coins>) and +1 ⚔. 💀"
    const outElimMatch = line.match(/^💀 You eliminated (.+)\. You receive their 💰\(\d+\) and \+1 ⚔\. 💀$/);
    if (outElimMatch) {
      result.outgoing = { target: outElimMatch[1], outcome: 'hit', attackerDied: false };
      i++;
      continue;
    }

    // "🛡 <target> blocked your ruthless attack! 🛡"
    const outInstakillBlockedMatch = line.match(/^🛡 (.+) blocked your ruthless attack! 🛡$/);
    if (outInstakillBlockedMatch) {
      result.outgoing = { target: outInstakillBlockedMatch[1], outcome: 'instakill_blocked', attackerDied: false };
      i++;
      continue;
    }

    // "💀 You instakilled <target>. 💀"
    const outInstakillMatch = line.match(/^💀 You instakilled (.+)\. 💀$/);
    if (outInstakillMatch) {
      result.outgoing = { target: outInstakillMatch[1], outcome: 'instakill', attackerDied: false };
      i++;
      continue;
    }

    // ── INCOMING: someone attacked me ───────────────────────────────────────

    // "⚔ Someone attacked you. You blocked. 🛡" (anonymous, 25%)
    if (line === '⚔ Someone attacked you. You blocked. 🛡') {
      const inc: IncomingCombat = { attacker: null, outcome: 'blocked', attackerDied: false };
      result.incoming.push(inc);
      i++;
      if (i < lines.length && lines[i].startsWith('💥 AND reflected their attack.')) {
        inc.outcome = 'reflected_back';
        i++;
        if (i < lines.length) {
          // If attacker died from reflection we learn their name here
          const killMatch = lines[i].match(/^💀 You eliminated (.+) with your 🛡\. You receive their 💰\(\d+\) and \+1 ⚔\. 💀$/);
          if (killMatch) {
            inc.attackerDied = true;
            inc.attacker = killMatch[1];
            i++;
          }
        }
      }
      continue;
    }

    // "⚔ <attacker> attacked you. You blocked. 🛡" (named, 75%)
    const incBlockNamedMatch = line.match(/^⚔ (.+) attacked you\. You blocked\. 🛡$/);
    if (incBlockNamedMatch) {
      const inc: IncomingCombat = { attacker: incBlockNamedMatch[1], outcome: 'blocked', attackerDied: false };
      result.incoming.push(inc);
      i++;
      if (i < lines.length && lines[i].startsWith('💥 AND reflected their attack.')) {
        inc.outcome = 'reflected_back';
        i++;
        if (i < lines.length) {
          const killMatch = lines[i].match(/^💀 You eliminated (.+) with your 🛡\. You receive their 💰\(\d+\) and \+1 ⚔\. 💀$/);
          if (killMatch) {
            inc.attackerDied = true;
            i++;
          }
        }
      }
      continue;
    }

    // "😱 You were attacked with instakill, but 🛡blocked🛡 it! 😱"
    if (line === '😱 You were attacked with instakill, but 🛡blocked🛡 it! 😱') {
      result.incoming.push({ attacker: null, outcome: 'instakill_blocked', attackerDied: false });
      i++;
      continue;
    }

    // "⚔ Someone attacked you. You lost ❤<dmg>." (anonymous, 50%)
    const incHitAnonMatch = line.match(/^⚔ Someone attacked you\. You lost ❤(\d+)\.$/);
    if (incHitAnonMatch) {
      result.incoming.push({ attacker: null, outcome: 'hit', attackerDied: false, damage: parseInt(incHitAnonMatch[1], 10) });
      i++;
      continue;
    }

    // "⚔ <attacker> attacked you. You lost ❤<dmg>." (named, 50%)
    const incHitNamedMatch = line.match(/^⚔ (.+) attacked you\. You lost ❤(\d+)\.$/);
    if (incHitNamedMatch) {
      result.incoming.push({ attacker: incHitNamedMatch[1], outcome: 'hit', attackerDied: false, damage: parseInt(incHitNamedMatch[2], 10) });
      i++;
      continue;
    }

    // "💀 You were instakilled. 💀"
    if (line === '💀 You were instakilled. 💀') {
      result.incoming.push({ attacker: null, outcome: 'instakill', attackerDied: false });
      i++;
      continue;
    }

    // ── WITNESS ─────────────────────────────────────────────────────────────

    // "💀 <attacker> eliminated <victim>. 💀"
    // Guard against "💀 You eliminated..." which is already handled above
    const witnessMatch = line.match(/^💀 (.+) eliminated (.+)\. 💀$/);
    if (witnessMatch && witnessMatch[1] !== 'You') {
      result.witnessedEliminations.push({ attacker: witnessMatch[1], victim: witnessMatch[2] });
    }

    // All other messages (resources, well rewards, etc.) are irrelevant for animations
    i++;
  }

  return result;
}
