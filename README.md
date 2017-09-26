# bite-assistant

Conversation Flow =>

[Welcome Intent]
user gets logged in automatically or is prompted to sign up.
all actions except "help" require the user to be logged in.

    sign up =>
        asks the user for the email of his current Bite account (and a code?) and connects the user if the email matches.

(choice)

user can choose from multiple commands:

    start ordering =>
        starts the main dialogue, user selects a location, an active Bite and food + sauce* and then confirms the order.

    get my orders => 
        gets the open orders made by the user and allow the user to change or delete the order.

    create a Bite =>
        lets the user create a Bite if he has the right permissions, this action can be performed during "start ordering" as well.

*certain functionalities may require changes to the existing database 