# tarkov-item-helper
Command-line app for helping decide which items to keep in the game Escape From Tarkov

Requires Node.js.  To run it, unzip the release and run `'node dist/index.js'`

The `/help` command will give you a list of the available commands.

The basic idea is that when you want to figure out what to do with an item, you enter its short name
(i.e. the name that appears on its icon in-game) and the app prints a list of uses for that item.  It
includes trades and crafts involving the item, quests where the item is an objective (assuming it has
the found-in-raid marker), and hideout modules that require it for construction.

Once you've made an assessment about the item, you record your conclusion using the `/note` command. This
command allows you to attach a 'note' to the item: some text that will be printed whenever the item appears
in the output in future. I typically use notes like **'sell'** or **'keep 3 for hideout'**, that kind of thing.
Attaching a note allows you to avoid going through the decision-making process again every time
you get the same item; when you enter the item's short name to view its details, the note is right there.

Here's an example:

<pre>
<b>---> salewa</b>
1:	"Salewa first aid kit" (Salewa)
			Wiki: https://escapefromtarkov.fandom.com/wiki/Salewa_first_aid_kit
			Trades and crafts involving this item:
2:	TRADE ("PAID AntiRoach spray" x1) at Therapist LL1 to get ("Salewa first aid kit" x1)
3:	*PMC1	CRAFT ("Analgin painkillers" x2, "Aseptic bandage" x2, "CALOK-B hemostatic applicator" x1, "Esmarch tourniquet" x2) at Hideout Medstation level 1 to get ("Salewa first aid kit" x1)
			Quest and hideout purposes for this item:
4:	"Salewa first aid kit" x3 -> Shortage *PMC1
<b>---> /note 1 keep 3 for quest</b>
			Note added
1:	"Salewa first aid kit" (Salewa) [USER NOTE: keep 3 for quest]
<b>---> salewa</b>
1:	"Salewa first aid kit" (Salewa) [USER NOTE: keep 3 for quest]
			Wiki: https://escapefromtarkov.fandom.com/wiki/Salewa_first_aid_kit
			Trades and crafts involving this item:
2:	TRADE ("PAID AntiRoach spray" x1) at Therapist LL1 to get ("Salewa first aid kit" x1)
3:	*PMC1	CRAFT ("Analgin painkillers" x2, "Aseptic bandage" x2, "CALOK-B hemostatic applicator" x1, "Esmarch tourniquet" x2) at Hideout Medstation level 1 to get ("Salewa first aid kit" x1)
			Quest and hideout purposes for this item:
4:	"Salewa first aid kit" x3 -> Shortage *PMC1
</pre>
