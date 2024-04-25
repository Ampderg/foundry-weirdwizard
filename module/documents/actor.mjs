import { i18n, formatTime, escape } from '../helpers/utils.mjs';

/**
* Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
* @extends {Actor}
*/

export default class WWActor extends Actor {

  async _preCreate(data, options, user) {
    const sourceId = this.getFlag("core", "sourceId");
    // Don't change actors imported from compendia.
    if (sourceId?.startsWith("Compendium.")) return await super._preCreate(data, options, user);

    let icon = data.img;

    // If no image is provided, set default by category.
    if (!icon) {

      switch (this.type) {

        case 'Character':
          icon = 'icons/svg/mystery-man.svg';
        break;

        case 'NPC':
          icon = 'icons/svg/mystery-man-black.svg';
        break;

      }

    }

    // Assign default Prototype Token Dispositions.
    let dispo = 1;

    switch (this.type) {

      case 'Character':
        dispo = 1;
      break;

      case 'NPC':
        dispo = -1;
      break;

    }

    // Set Protoype Token Sight by actor type.
    let sight;

    switch (this.type) {

      case 'Character':
        sight = {
          enabled: true
        };
      break;

    }

    // Set Protoype Token Actor Link by actor type.
    let actorLink = false;

    switch (this.type) {

      case 'Character':
        actorLink = true;
      break;

    }

    await this.updateSource({
      img: icon,
      'prototypeToken.disposition': dispo,
      'prototypeToken.sight': sight,
      'prototypeToken.actorLink': actorLink
    });

    return await super._preCreate(data, options, user);
  }

  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);

    // Record Incapacitated status
    const cStats = await changed.system?.stats;

    if (cStats?.health || cStats?.damage) {
      // Get variables
      const health = await this.system.stats.health.current;
      const damage = await this.system.stats.damage.value;
      const cHealth = cStats.health?.current;
      const cDamage = cStats.damage?.value;
      
      // Set incapactated status
      if (cDamage >= await health || await cHealth <= await damage || await health == await damage) this.incapacitated = true; else this.incapacitated = false;
      if (await cDamage < await damage) this.incapacitated = false;
    }
    
    // Update token status icons
    if ((changed.system?.stats?.damage || changed.system?.stats?.health) && this.token) {
      this.token.object.updateStatusIcons();
    }

  };

  /** @override */
  _preUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    // Record incapacitated status
    const health = this.system?.stats?.health?.current;
    const damage = this.system?.stats?.damage?.value;
    if (damage >= health) this.incapacitated = true; else this.incapacitated = false;

    super._preUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    this._onEmbeddedDocumentChange();
  }

  /** @override */
  prepareData() {
    // Prepare data for the actor. Calling the super version of this executes
    // the following, in order: data reset (to clear active effects),
    // prepareBaseData(), prepareEmbeddedDocuments(),
    // prepareDerivedData().
    super.prepareData();
  }

  /** @override */
  prepareBaseData() {
    // Data modifications in this step occur before processing embedded
    // documents (including active effects) or derived data.
    super.prepareBaseData();
    
    // Create boons variables
    this.system.boons = {
      attributes: {
        luck: {
          global: 0,
          conditional: 0
        }
      },
      attacks: {
        global: 0,
        conditional: 0
      },
      against: {
        def: 0
      }
    };

    // Create objects
    this.system.autoFail = {};
    this.system.against = {};

    // Create halved boolean for Speed reductions
    this.system.stats.speed.halved = false;

    // Create dynamic Defense properties
    this.system.stats.defense.armored = 0;
    this.system.stats.defense.bonus = 0;

    // Attributes
    const attributes = this.system.boons.attributes;
    const autoFail = this.system.autoFail;
    const against = this.system.boons.against;

    ['str', 'agi', 'int', 'wil'].forEach(function (attribute) {
      attributes[attribute] = {
        global: 0,
        conditional: 0
      }

      against[attribute] = 0;

      autoFail[attribute] = false;
    })

    // Create Extra Damage variables
    this.system.extraDamage = {
      attacks: {
        globalDice: 0,
        globalMod: 0
      }
    }

  }

  async _onUpdate(changed, options, user) {
    await super._onUpdate(changed, options, user);
    
    // Update token status icons
    if ((changed.system?.stats?.damage || changed.system?.stats?.health) && this.token) {
      this.token.object.updateStatusIcons();
    }
    
    // Update Character Options if Level updates
    if (changed.system?.stats?.level) {
      
      for (const i of this.items) {
        if (user !== game.user.id) return;
        if (i.charOption) i.updateBenefitsOnActor();
      }
      
    }

  };

  /**
   * @override
   * Augment the basic actor data with additional dynamic data. Typically,
   * you'll want to handle most of your calculated/derived data in this step.
   * Data calculated in this step should generally not exist in template.json
   * (such as ability modifiers rather than ability scores) and should be
   * available both inside and outside of character sheets (such as if an actor
   * is queried and has a roll executed directly from it).
  */

  prepareDerivedData() {
    const system = this.system;
    const flags = this.flags.weirdwizard || {};
    
    // Loop through attributes, and add their modifiers calculated with DLE rules to our sheet output.
    for (let [key, attribute] of Object.entries(system.attributes)) {
      if (key != 'luck') attribute.mod = attribute.value - 10;
    }

    // Create .statuses manually for v10
    if (this.statuses == undefined) {
      this.statuses = this.effects.reduce((acc, eff) => {
        if (!eff.modifiesActor) return acc;
        const status = eff.flags.core?.statusId;
        if (status) acc.add(status);
        return acc;
      }, new Set());
    }
    
    // Calculate Health
    this._calculateHealth(system);

    // Calculate Speed
    this._calculateSpeed(system);

    // Make separate methods for each Actor type (character, npc, etc.) to keep
    // things organized.
    this._prepareCharacterData(system);
    this._prepareNpcData(system);
  }

  /**
  * Prepare Character type specific data
  */

  _prepareCharacterData(system) {
    if (this.type !== 'Character') return;

    // Calculate total Defense
    this._calculateDefense(system);
  }

  /**
  * Prepare NPC type specific data.
  */

  _prepareNpcData(system) {
    if (this.type !== 'NPC') return;

    // Assign Current Health to Max Damage for Token Bars
    system.stats.damage.max = system.stats.health.current;

  }

  /* -------------------------------------------- */
  /*  Apply Methods                               */
  /* -------------------------------------------- */

  async applyDamage(damage) {
    // If incapacitated, turn damage into Health loss
    if (this.incapacitated) return this.applyHealthLoss(damage);

    // Get values
    const oldTotal = this.system.stats.damage.value;
    const health = this.system.stats.health.current;
    let newTotal = oldTotal + parseInt(damage);
    let healthLost = 0;

    if (newTotal > health) {
      healthLost = newTotal - health;
      newTotal = health;
    }

    const content = `
      <p style="display: inline"><b>${game.weirdwizard.utils.getAlias({ actor: this })}</b> ${i18n('WW.InstantEffect.Apply.Took')} ${damage} ${i18n('WW.InstantEffect.Apply.DamageLc')}.</p>
      <p>${i18n('WW.InstantEffect.Apply.DamageTotal')}: ${oldTotal} <i class="fas fa-arrow-right"></i> ${newTotal}</p>
    `;

    ChatMessage.create({
      speaker: game.weirdwizard.utils.getSpeaker({ actor: this }),
      content: content,
      sound: CONFIG.sounds.notification
    })

    this.update({ 'system.stats.damage.value': newTotal });
  }

  async applyHealing(healing) {

    // Get values
    const oldTotal = this.system.stats.damage.value;
    const newTotal = ((oldTotal - parseInt(healing)) > 0) ? oldTotal - parseInt(healing) : 0;

    const content = `
      <p style="display: inline"><b>${game.weirdwizard.utils.getAlias({ actor: this })}</b> ${i18n('WW.InstantEffect.Apply.Healed')} ${healing} ${i18n('WW.InstantEffect.Apply.DamageLc')}.</p>
      <p>${i18n('WW.InstantEffect.Apply.DamageTotal')}: ${oldTotal} <i class="fas fa-arrow-right"></i> ${newTotal}</p>
    `;

    ChatMessage.create({
      speaker: game.weirdwizard.utils.getSpeaker({ actor: this }),
      content: content,
      sound: CONFIG.sounds.notification
    })

    this.update({ 'system.stats.damage.value': newTotal });
  }

  /* Apply loss to Health */
  async applyHealthLoss(loss) {
    const oldCurrent = this.system.stats.health.current;
    loss = parseInt(loss);
    const current = (oldCurrent - loss) > 0 ? oldCurrent - loss : 0;

    const content = `
      <p style="display: inline"><b>${game.weirdwizard.utils.getAlias({ actor: this })}</b> ${i18n('WW.InstantEffect.Apply.Lost')} ${loss} ${i18n('WW.InstantEffect.Apply.Health')}.</p>
      <p>${i18n('WW.InstantEffect.Apply.CurrentHealth')}: ${oldCurrent} <i class="fas fa-arrow-right"></i> ${current}</p>
    `;

    ChatMessage.create({
      speaker: game.weirdwizard.utils.getSpeaker({ actor: this }),
      content: content,
      sound: CONFIG.sounds.notification
    })

    //this.update({ 'system.stats.health.lost': lost + loss });
    this.update({ 'system.stats.health.current': current });
  }

  /* Apply lost Health regain */
  async applyHealthRegain(max) {
    const lost = this.system.stats.health.lost;
    const oldCurrent = this.system.stats.health.current;
    max = parseInt(max);
    const regained = max > lost ? lost : max;
    const current = oldCurrent + regained;
    
    const content = `
      <p style="display: inline"><b>${game.weirdwizard.utils.getAlias({ actor: this })}</b> ${i18n('WW.InstantEffect.Apply.Regained')} ${regained} ${i18n('WW.InstantEffect.Apply.Health')}.</p>
      <p>${i18n('WW.InstantEffect.Apply.CurrentHealth')}: ${oldCurrent} <i class="fas fa-arrow-right"></i> ${current}</p>
    `;

    ChatMessage.create({
      speaker: game.weirdwizard.utils.getSpeaker({ actor: this }),
      content: content,
      sound: CONFIG.sounds.notification
    })

    this.update({ 'system.stats.health.current': current });
  }

  /* Apply Affliction */
  async applyAffliction(key) {
  
    // Get affliction
    const effect = CONFIG.statusEffects.find(a => a.id === key);
    effect['statuses'] = [effect.id];
  
    if (!effect) {
      console.warn('Weird Wizard | applyAffliction | Affliction not found!')
      return
    }

    let content = '';

    // Check if the actor already has the affliction
    if (this.statuses.has(key)) {
      content = `<b>${game.weirdwizard.utils.getAlias({ actor: this })}</b> ${i18n('WW.Affliction.Already')} <b class="info" data-tooltip="${effect.description}">${effect.name}</b>.`;
    } else {
      await ActiveEffect.create(effect, {parent: this});
      content = `<b>${game.weirdwizard.utils.getAlias({ actor: this })}</b> ${i18n('WW.Affliction.Becomes')} <b class="info" data-tooltip="${effect.description}">${effect.name}</b>.`;
    }

    // Send chat message
    ChatMessage.create({
      speaker: game.weirdwizard.utils.getSpeaker({ actor: this }),
      content: content,
      sound: CONFIG.sounds.notification
    })

  }

  /* Apply Active Effect */
  async applyEffect(effectUuid, external) {

    let obj = fromUuidSync(effectUuid).toObject()

    obj.flags.weirdwizard.trigger = 'passive';
    if (external) obj.flags.weirdwizard.external = true;

    let content = `<p><b class="info" data-tooltip="${obj.description}">${obj.name}</b> ${i18n('WW.Effect.AppliedTo')} <b>${game.weirdwizard.utils.getAlias({ actor: this })}</b>.</p>`;

    ChatMessage.create({
      speaker: game.weirdwizard.utils.getSpeaker({ actor: this }),
      content: content,
      sound: CONFIG.sounds.notification
    })

    this.createEmbeddedDocuments("ActiveEffect", [obj]);

  }

  /* -------------------------------------------- */
  /*  Calculations                                */
  /* -------------------------------------------- */

  _calculateDefense(system) {
    const defense = system.stats.defense;

    // Defense override effect exists
    if (defense.override) defense.total = defense.override;
    else {
      (defense.natural > defense.armored) ? defense.total = defense.natural : defense.total = defense.armored;
      defense.total += defense.bonus;
    }
    
  }

  _calculateHealth(system) {
    // Get variables
    const health = system.stats.health;
    const current = health.current;
    const damage = system.stats.damage.value;

    // Set Damage to Health while incapacitated or when Damage is higher than Health   
    if (this.incapacitated === undefined) this.incapacitated = (damage >= current) ? true : false;
    
    if (this.incapacitated || (damage > current)) {
      this.system.stats.damage.value = this.system.stats.health.current;
    }
    
    if (this.system.stats.damage.value >= current) this.incapacitated = true;
    
    // Health override effect exists
    if (health.override) {
      health.normal = health.override;
    }
    
    // Calculate temporary Health and assign it
    health.temp = health.current - this.toObject().system?.stats.health.current;

    // Calculate lost Health and assign it
    if (health.normal - health.current >= 0) health.lost = health.normal - health.current; else health.lost = 0;

    // Assign Current Health to Max Damage for Token Bars
    system.stats.damage.max = current;
    
  }

  _calculateSpeed(system) {
    const speed = system.stats.speed;
    
    // Halve Speed
    if (speed.halved) speed.current = Math.floor(speed.normal / 2)

    // Assign normal Speed
    else speed.current = speed.normal;
    
  }

  /* -------------------------------------------- */
  /*  Active Effects                              */
  /* -------------------------------------------- */

  *allApplicableEffects() {
    for (let effect of super.allApplicableEffects()) {
      if (!effect.determineTransfer(this)) continue;
      yield effect;
    }
  }

  /**
   * Deletes expired temporary active effects and disables linked expired buffs.
   * Code borrowed from Pathfinder 1e system.
   *
   * @param {object} [options] Additional options
   * @param {Combat} [options.combat] Combat to expire data in, if relevant
   * @param {number} [options.timeOffset=0] Time offset from world time
   * @param {DocumentModificationContext} [context] Document update context
   */
  async expireActiveEffects({ combat, timeOffset = 0 } = {}, context = {}) {
    if (!this.isOwner) throw new Error("Must be owner");
    const worldTime = game.time.worldTime + timeOffset;
    
    const temporaryEffects = this.temporaryEffects.filter((ae) => {
      const { seconds, rounds, startTime, startRound } = ae.duration;
      // Calculate remaining duration.
      // AE.duration.remaining is updated by Foundry only in combat and is unreliable.
      
      if (seconds > 0) {
        const elapsed = worldTime - (startTime ?? 0),
          remaining = seconds - elapsed;
        return remaining <= 0;
      }/* else if (rounds > 0 && combat) {
        
        const elapsed = combat.round - (startRound ?? 0),
          remaining = rounds - elapsed;
        
        return remaining <= 0;
      }*/
      else return false;
    });

    const disableActiveEffects = [],
      deleteActiveEffects = [],
      disableBuffs = [],
      actorUpdate = {};

    const v11 = game.release.generation >= 11;
    
    for (const ae of temporaryEffects) {

      //const re = ae.origin?.match(/Item\.(?<itemId>\w+)/);
      //const item = this.items.get(re?.groups.itemId);
      const conditionId = v11 ? ae.statuses.first() : ae.getFlag("core", "statusId");

      if (conditionId) {
        // Disable expired conditions
        actorUpdate[`system.attributes.conditions.-=${conditionId}`] = null;
      } else {
        const duration = ae.duration.seconds ? formatTime(ae.duration.seconds) : ae.duration.rounds + ' ' + (ae.duration.rounds > 1 ? i18n('WW.Effect.Duration.Rounds') : i18n('WW.Effect.Duration.Round'));

        await ChatMessage.create({
          speaker: game.weirdwizard.utils.getSpeaker({ actor: this }),
          flavor: this.label,
          content: '<div><b>' + ae.name + '</b> ' + i18n("WW.Effect.Duration.ExpiredMsg") + ' ' + duration + '.</div>',
          sound: CONFIG.sounds.notification
        });

        if (ae.autoDelete) {
          deleteActiveEffects.push(ae.id);
        } else {
          disableActiveEffects.push({ _id: ae.id, disabled: true });
        }
      }
    }

    // Add context info for why this update happens to allow modules to understand the cause.
    //context.pf1 ??= {};
    //context.pf1.reason = "duration";
    const hasActorUpdates = !foundry.utils.isEmpty(actorUpdate);

    const deleteAEContext = mergeObject(
      { render: !disableBuffs.length && !disableActiveEffects.length && !hasActorUpdates },
      context
    );
    if (deleteActiveEffects.length)
      await this.deleteEmbeddedDocuments("ActiveEffect", deleteActiveEffects, deleteAEContext);

    const disableAEContext = mergeObject({ render: !disableBuffs.length && !hasActorUpdates }, context);
    if (disableActiveEffects.length)
      await this.updateEmbeddedDocuments("ActiveEffect", disableActiveEffects, disableAEContext);

    const disableBuffContext = mergeObject({ render: !hasActorUpdates }, context);
    if (disableBuffs.length) await this.updateEmbeddedDocuments("Item", disableBuffs, disableBuffContext);

    if (hasActorUpdates) await this.update(actorUpdate, context);
  }

  /* -------------------------------------------- */
  /*  Properties (Getters)                        */
  /* -------------------------------------------- */

  /**
   * Determine whether the character is injured.
   * @type {boolean}
   */
  get injured() {
    const damage = this.system.stats.damage.value;
    const current = this.system.stats.health.current;

    return (damage >= Math.floor(current / 2)) ? true : false;
  }

  /**
   * Determine whether the character is dead or destroyed.
   * @type {boolean}
   */
  get dead() {
    return (this.system.stats.health.current > 0) ? false : true;
  }

}
