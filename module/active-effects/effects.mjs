/**
 * Manage Active Effect instances through the Actor Sheet via effect control buttons.
 * @param {MouseEvent} event      The left-click event on the effect control
 * @param {Actor|Item} owner      The owning entity which manages this effect
*/
//import {calcEffectRemainingRounds, calcEffectRemainingSeconds, calcEffectRemainingTurn} from "../combat/combat.mjs";
import {i18n} from "../helpers/utils.mjs";

export async function onManageActiveEffect(event, owner) {
  event.preventDefault();
  const a = event.currentTarget;
  const li = a.closest('li');
  const effect = li.dataset.effectId ? owner.effects.get(li.dataset.effectId) : null;
  switch ( a.dataset.action ) {
    case 'create':
      return owner
        .createEmbeddedDocuments('ActiveEffect', [{
          name: i18n('WW.NewEffect'),
          icon: /*isCharacter ? 'icons/magic/symbols/chevron-elipse-circle-blue.webp' :*/ owner.img,
          origin: owner.uuid,
          'duration.rounds': li.dataset.effectType === 'temporary' ? 1 : undefined,
          disabled: li.dataset.effectType === 'inactive'
        },
      ])
      .then(effects => effects[0].sheet.render(true));
    case 'edit':
      return effect.sheet.render(true);
    case 'delete':
      return await effect.delete();
    case 'toggle':
      return await effect.update({ disabled: !effect.disabled });
  }
}

/**
 * Prepare the data structure for Active Effects which are currently applied to an Actor or Item.
 * @param {ActiveEffect[]} effects    The array of Active Effect instances to prepare sheet data for
 * @param {Boolean} showCreateButtons Show create buttons on page
 * @param {Integer} showControls      What controls to show
 * @return {object}                   Data for rendering
*/

export function prepareActiveEffectCategories(effects, showCreateButtons = false, showControls = 3) {

  // Define effect header categories
  let categories = {
    temporary: {
      type: 'temporary',
      name: 'Temporary Effects',
      showCreateButtons: showCreateButtons,
      showControls: showControls,
      effects: [],
    },
    passive: {
      type: 'passive',
      name: 'Passive Effects',
      showCreateButtons: showCreateButtons,
      showControls: showControls,
      effects: [],
    },
    inactive: {
      type: 'inactive',
      name: 'Inactive Effects',
      showCreateButtons: showCreateButtons,
      showControls: showControls,
      effects: [],
    },
  }

  // Iterate over active effects, classifying them into categories.
  for (let e of effects) {
    // Also set the 'remaining time' in seconds or rounds depending on if in combat
    /*if (e.isTemporary && (e.duration.seconds || e.duration.rounds || e.duration.turns)) {
      if (game.combat) {
        if (e.duration.turns > 0) {
          const rr = calcEffectRemainingRounds(e, game.combat.round)
          const rt = calcEffectRemainingTurn(e, game.combat.turn)
          const sr = `${rr} ${Math.abs(rr) > 1 ? i18n('COMBAT.Rounds') : i18n('COMBAT.Round')}`
          const st = `${rt} ${Math.abs(rt) > 1 ? i18n('COMBAT.Turns') : i18n('COMBAT.Turn')}`
          e.dlRemaining = sr + ' ' + st
        }
        else {
          const r = calcEffectRemainingRounds(e, game.combat.round)
          e.dlRemaining = `${r} ${Math.abs(r) > 1 ? i18n('COMBAT.Rounds') : i18n('COMBAT.Round')}`
        }
      } else {
        const r = calcEffectRemainingSeconds(e, game.time.worldTime)
        e.dlRemaining = `${r} ${i18n('TIME.Seconds')}`
      }
    } else {
      e.dlRemaining = e.duration.label
    }*/

    if (e.disabled) categories.inactive.effects.push(e)
    else if (e.isTemporary) categories.temporary.effects.push(e)
    else categories.passive.effects.push(e)
  }

  return categories
}