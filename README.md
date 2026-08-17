my personal art website to share my paintings and update my web app coding skills

to deploy:
copy .env.example to .env and fill in your database connection info and admin password for the webapp

create the postgres database:
sudo -u postgres createdb mydb

create the database tables:
sudo -u postgres psql -d mydb -f schema.sql

make sure the database user in your .env has access to the gallery_images table
