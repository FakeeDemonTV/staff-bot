const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    SlashCommandBuilder,
    REST,
    Routes
} = require("discord.js");

const fs = require("fs");


// =====================
// CONFIG
// =====================

const TOKEN = process.env.TOKEN;

const CLIENT_ID = "1466413715963379869";

const STAFF_ROLE = "1520044327848513587";

const REPORT_CHANNEL = "1520044142950879294";

const WEEKLY_CHANNEL = "1520044117890170971";

const GUILD_ID = "1383075168049692855";



// =====================
// CLIENT
// =====================

const client = new Client({

    intents:[

        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent

    ]

});



// =====================
// SLASH COMMANDS
// =====================

const commands = [

new SlashCommandBuilder()
.setName("stats")
.setDescription("Mostra le tue statistiche"),


new SlashCommandBuilder()
.setName("classifica")
.setDescription("Mostra la classifica settimanale")

].map(x=>x.toJSON());



const rest = new REST({version:"10"})
.setToken(TOKEN);



(async()=>{

await rest.put(

Routes.applicationGuildCommands(
CLIENT_ID,
GUILD_ID
),

{
body:commands
}

);

console.log("Comandi caricati");

})();




// =====================
// DATABASE
// =====================

let stats = {};

let weekly = {};


if(fs.existsSync("stats.json"))
stats = JSON.parse(fs.readFileSync("stats.json"));


if(fs.existsSync("weekly.json"))
weekly = JSON.parse(fs.readFileSync("weekly.json"));



function save(){

fs.writeFileSync(
"stats.json",
JSON.stringify(stats,null,2)
);

}



function saveWeekly(){

fs.writeFileSync(
"weekly.json",
JSON.stringify(weekly,null,2)
);

}



function getUser(id){

if(!stats[id]){

stats[id]={

voice:0,
mute:0,
deaf:0,
messages:0,

voiceStart:null,
muteStart:null,
deafStart:null

};

}

return stats[id];

}



function format(sec){

let h=Math.floor(sec/3600);

let m=Math.floor((sec%3600)/60);

return `${h}h ${m}m`;

}





client.once("ready",()=>{

console.log(
`Online ${client.user.tag}`
);

});






// =====================
// VOCALE
// =====================


client.on(
"voiceStateUpdate",
(oldState,newState)=>{


let member=newState.member;


if(!member.roles.cache.has(STAFF_ROLE))
return;



let data=getUser(member.id);



if(!oldState.channel && newState.channel){

data.voiceStart=Date.now();

}




if(oldState.channel && !newState.channel){


if(data.voiceStart){

data.voice +=
(Date.now()-data.voiceStart)/1000;


data.voiceStart=null;

}

}




if(oldState.selfMute!==newState.selfMute){


if(newState.selfMute)

data.muteStart=Date.now();


else if(data.muteStart){

data.mute +=
(Date.now()-data.muteStart)/1000;


data.muteStart=null;

}


}




if(oldState.selfDeaf!==newState.selfDeaf){


if(newState.selfDeaf)

data.deafStart=Date.now();


else if(data.deafStart){


data.deaf +=
(Date.now()-data.deafStart)/1000;


data.deafStart=null;


}

}



save();


});







// =====================
// MESSAGGI
// =====================


client.on(
"messageCreate",
message=>{


if(message.author.bot)
return;



if(message.member?.roles.cache.has(STAFF_ROLE)){


let data=getUser(message.author.id);

data.messages++;

save();

}


});







// =====================
// SLASH
// =====================


client.on(
"interactionCreate",
async interaction=>{


    if(!interaction.isChatInputCommand())
        return;



    try {



        if(interaction.commandName==="stats"){



            let d = getUser(
                interaction.user.id
            );



            let embed = new EmbedBuilder()

            .setTitle(
                "📊 Le tue statistiche"
            )

            .addFields(

                {
                    name:"🎧 Vocale",
                    value:format(d.voice),
                    inline:true
                },

                {
                    name:"🔇 Mute",
                    value:format(d.mute),
                    inline:true
                },

                {
                    name:"🎧 Deaf",
                    value:format(d.deaf),
                    inline:true
                },

                {
                    name:"💬 Messaggi",
                    value:String(d.messages),
                    inline:true
                }

            );



            await interaction.reply({

                embeds:[embed],

                ephemeral:true

            });



        }




        if(interaction.commandName==="classifica"){



            let list =
            Object.entries(weekly);



            list.sort(
                (a,b)=>
                b[1].voice-a[1].voice
            );



            let embed =
            new EmbedBuilder()

            .setTitle(
                "🏆 Classifica Staff Settimanale"
            );



            let pos = 1;



            for(
                let [id,data]
                of list.slice(0,10)
            ){



                let membro =
                await interaction.guild.members.fetch(id)
                .catch(()=>null);



                if(membro){


                    embed.addFields({

                        name:
                        `${pos}° ${membro.user.username}`,

                        value:
                        `🎧 ${format(data.voice)}
💬 ${data.messages} messaggi`

                    });


                    pos++;

                }


            }



            await interaction.reply({

                embeds:[embed]

            });



        }



    }
    catch(error){


        console.log(error);


        if(!interaction.replied){


            await interaction.reply({

                content:"❌ Errore nel comando",

                ephemeral:true

            });


        }


    }


});



setInterval(async()=>{


    let now = new Date();


    if(
        now.getHours()==23 &&
        now.getMinutes()==59
    ){


        // tutto il codice del report qui


    }


},60000);




client.login(TOKEN);
