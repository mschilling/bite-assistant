# bite-assistant

The Bite Assistant is a Chat bot powered by Google Assistant and Dialogflow. With the Bite Assistant Users will be able to place, view and edit orders in the Bite app by voice commands.

Conversations with the Bite Assistant won’t take very long and can be over with a single sentence depending on the user input, even so there is still room for a personality. The personality will be focused around familiarity and humour with the occasional joke. Imagine it to be the person behind the counter of the snack bar that you regularly visit.  

The Bite Assistant will have 3 “main” conversation branches for normal users and 4 for Admins. There will also be a few smaller commands for users and admins to call. The main branches being the important functions for placing an order. 

The login flow will be handled by Google, with a custom made OAuth server, the User has to be signed in to access the app. Users will always have to go through the welcome intent since that is where they are authenticated(currently an user can not activate any other intents besides the welcome intent at startup)

-History

22/9/2017 - Initial Commit

30/10/2017 - Version 1.0 Submitted for review:
    All primary requirements are included and app is functional.
        OAuth Implicit Flow is working but could use improvement.
        Currently an user can not activate any other intents besides the welcome intent at startup.
        Conversations lack personality.
        Small context issues.

Version 2.0 In progress:
    Switch from Firebase to Firestore (complete code overhaul).
    Address issues present in Version 1.0.
