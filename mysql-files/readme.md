# คำสั่ง terminal
Get-Content .\mysql-files\staging_import.sql -Raw | docker exec -i project-noncon-db mysql -u root -prootpassword project_noncon
