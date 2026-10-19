-- Coach-built meal plan per client: {maaltijden:[{naam, dagboek, train, notitie, items:[{key, g, vast}]}]}
ALTER TABLE clients ADD COLUMN maaltijdplan TEXT;
