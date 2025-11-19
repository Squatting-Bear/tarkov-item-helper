
# Note: the wiki text can be downloaded from:
# https://escapefromtarkov.fandom.com/wiki/Special:Statistics
# (The 'current pages' link in the 'Database dumps' section down the bottom.)

export PATH=/home/pantload/bin/node-v16.14.0-linux-x64/bin/:${PATH}
export WIKI_XML_FILE='e:\tmp\escapefromtarkov_gamepedia_pages_current.xml'
export LOCALE_FILE='e:\tmp\TestBackendLocaleEn-resources.assets.dat'

node ./quests.js ${WIKI_XML_FILE}
node ./hideout.js ${WIKI_XML_FILE}
node ./crafts-and-trades.js ${WIKI_XML_FILE}
node ./item-names.js ${LOCALE_FILE}
