import {
  fields,
  base,
  /*physical,
  activity,
  makeStrField,
  makeBooField,
  makeHtmlField*/
} from './charoptions_base.mjs'

export default class ProfessionData extends foundry.abstract.DataModel {

  static defineSchema() {
    const type = 'Profession';
    
    return {
      ...base(type),
      ...physical(type),
      ...activity(type),

      compendiaInt: new fields.SchemaField({
        value: makeIntField(),
        coin: makeStrField('sp')
      }),

      subtype: makeStrField('generic',0,1),
      quality: makeStrField('standard'),
      attribute: makeStrField(),

      // Weapons
      requirements: makeStrField(),
      damage: makeStrField(),
      grip: makeStrField('One-Handed'),

      traits: new fields.SchemaField({
        ammunition: makeBooField(false),
        brutal: makeBooField(false),
        firearm: makeBooField(false),
        forceful: makeBooField(false),
        long: makeBooField(false),
        nimble: makeBooField(false),
        precise: makeBooField(false),
        range: makeBooField(false),
        sharp: makeBooField(false),
        shattering: makeBooField(false),
        special: makeBooField(false),
        thrown: makeBooField(false),
        versatile: makeBooField(false)
      }),

      advantages: new fields.SchemaField({
        disarming: makeBooField(false),
        disrupting: makeBooField(false),
        driving: makeBooField(false),
        guarding: makeBooField(false),
        lunging: makeBooField(false),
        pressing: makeBooField(false),
        special: makeBooField(false)
      }),

      disadvantages: new fields.SchemaField({
        fixed: makeBooField(false),
        light: makeBooField(false),
        reload: makeBooField(false),
        slow: makeBooField(false)
      }),

      attackRider: makeHtmlField(),
      reloaded: makeBooField(true),
      armorType: makeStrField('light'),
      
      //capacity: makeIntField(),
      //consumableType: makeStrField('potion')
    }
  }

  /**
   * Migrate source data from some prior format into a new specification.
   * The source parameter is either original data retrieved from disk or provided by an update operation.
   * @inheritDoc
   */
  static migrateData(source) {
    
    // Make sure Range is a number
    if ('range' in source && isNaN(source.range)) source.range = 0;

    // Migrate weapon properties
    if ('properties' in source && !Object.values(source.properties).every(item => item === false)) {
      const properties = source.properties;
      
      let traits = source.traits ? source.traits : {};
      let advantages = source.advantages ? source.advantages : {};
      let disadvantages = source.disadvantages ? source.disadvantages : {};

      const traitsList = ['ammunition', 'brutal', 'firearm', 'long', 'nimble', 'precise', 'range', 'sharp', 'shattering', 'thrown', 'versatile'];
      const advantagesList = ['disarming', 'driving'];
      const disadvantagesList = ['light', 'reload', 'slow'];

      for (const p of Object.keys(properties)) {
        
        // Assign traits
        if (p === 'concussing' && properties[p]) traits['shattering'] = true;
        if (p === 'fast' && properties[p]) traits['precise'] = true;
        if (p === 'great' && properties[p]) traits['forceful'] = true;
        if (p === 'painful' && properties[p]) traits['special'] = true;
        if (p === 'unbalancing' && properties[p]) traits['forceful'] = true;
        if (traitsList.includes(p) && properties[p]) traits[p] = true;
        
        // Assign advantages
        if (advantagesList.includes(p) && properties[p]) advantages[p] = true;
        
        // Assign disadvantages
        if (disadvantagesList.includes(p) && properties[p]) disadvantages[p] = true;
        
      }

      source.traits = traits;
      source.advantages = advantages;
      source.disadvantages = disadvantages;

    }
    

    return super.migrateData(source);
  }

  /**
   * Determine whether the item is destroyed.
   * @type {boolean}
   */
  get destroyed() {
    const invulnerable = CONFIG.specialStatusEffects.INVULNERABLE;
    if ( this.parent.effects.some(e => e.statuses.has('invulnerable') )) return false;
    return this.health.value <= this.health.min;
  }

  /* The defined destroyed property could then be accessed on any Actor document of the item type as follows:

  // Determine if a item is destroyed.
  game.actors.getName('Character').system.destroyed;
  */

}