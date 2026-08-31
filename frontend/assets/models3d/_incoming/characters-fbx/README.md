# The 18 character packs that are still missing

Copy these 18 folders from `All in One - Quaternius[Patreon] / Characters and
Animals` into **this** folder. Not into `../characters/` — that is the folder
that lost them.

You do not need to check what format any of them ship. This folder keeps glTF,
FBX and textures alike; the ingest picks the best one and ignores the rest.

### Arrived with a preview image and nothing else (10)

The models were dropped by the format filter. The folder is in the repository,
but there is no character in it.

- Animated Men Characters - Feb 2019
- Animated Robot - Oct 2018
- Animated Women Characters - Feb 2019
- Easy Animated Enemy Pack - Jan 2019
- Fruit Characters Animated - Mar 2017
- Man Animated - Oct 2017
- Old
- Posed Background Characters - Aug 2018
- Woman Animated - Dec 2017
- Zombie Animated - Jan 2018

### Never reached the repository at all (8)

Nothing in these survived the filter, so git had no file to record and the
folder itself does not exist here. These were the invisible loss.

- Alien Animated - April 2019
- Cute Fish Pack - Feb 2020
- Dinosaur Animated Pack - Dec 2018
- Farm Animals Animated - Jun 2018
- Fish Pack Animated - Apr 2018
- Goblin Animated [Patreon Exclusive]
- Knight Character Animated - Jul 2018
- Monster Pack Animated - Aug 2018

### Already in and working — do NOT copy these (10)

- Animated Mech Pack - March 2021
- Cute Animated Monsters - Aug 2020
- Modular Character Outfits - Fantasy[Standard]
- RPG Characters - Nov 2020
- Ultimate Animated Animals - July 2021
- Ultimate Animated Character Pack - Nov 2019
- Ultimate Modular Men - Feb 2022
- Ultimate Modular Women - April 2022
- Ultimate Monsters - Oct 2022
- Universal Base Characters[Standard]

---

After copying, before you commit, run:

```bash
node tools/check-incoming.mjs
```

It prints one line per pack saying what git will keep, and refuses quietly to
be optimistic: a pack with no loadable model is listed as **LOST**, which is
your cue to look at it rather than to push.

See `/UPLOADING-ASSETS.md` in the repository root.
