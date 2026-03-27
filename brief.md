# Timely - a time-off tracking application

Timely is a simple application to track a user's accural and usage of PTO. It is a single-user application intended to be as simple as possible and run locally in the browser. 

## Features

The application is intended for users who accrue PTO on a biweekly basis and want to plan future time off. The application is calendar-based and revolves around annotating dates and predicting PTO avaliable on future dates.

Users should be able to:
- Mark days with several properties:
    - Pay-day: the end of a pay period, annotated with the number of hours accrued during the period; accrual rate is assumed to be biweekly with this rate going forward; optionally anchors the current PTO balance as of that date
    - Time off: either full day (based on work schedule) or # of hours; days in the future are considered planned and days in the past are considered taken
    - Unpaid: days that do not accrue PTO
    - Each date can have zero or one of each type of annotation
- See the anticipated avaliable PTO at any date in the future
- Configure a 'reserve' PTO amount that they do not want to dip below; see dates in the future that drop below this level
- Configure a weekly work schedule (hours per day) used to determine full-day PTO amounts and pro-rate accrual around unpaid periods

## Layout

The application has two main views:
- Calendar view: a scrolling monthly calendar view that highlights days by the annotations that the user has entered
    - User can select a date to show a pane at the bottom of the window with annotations and predicted avaliable PTO
    - From this pane they can add, delete, and edit annotations
    - Includes standard calendar controls like going to the next and previous month, and jumping to the current date
- Events view: a scrolling list of annotated dates
    - Each date with annotation is shown with same view as selected-date pane in the calendar view
    - Button to enter a modal dialog to add a new event

There is also a settings screen that allows configuration of the reserve PTO amount, the weekly work schedule, downloading of the application's data to a JSON file, and restoration of a backup JSON file.

The application is intended to be used in a vertically-oriented mobile-optimized layout.

### Components

Some common components in the application are:

- Monthly calendar
    - shows a single month in a standard calendar layout
    - uses colored dots to highlight user annotations
    - responds to user clicks to select a date
- Daily annotations view
    - Shows annotations for a particular date
    - Includes controls to delete and edit those annotations
- Add annotations view
    - allows users to add an annotation to a date or date range
        - 'pay-day' can be applied to a single date; 'time off' and 'unpaid' can be applied to a date range
    - allows entry of annotation-specific information (such as # of hours or accrual rate)
    - default annotation type is time off

## Technologies

The application will be written in typescript using the shadcn UI component library. It will be served as a static site and run entirely client-side.
Data storage will be via local web storage APIs. 

The business logic for time-off prediction and tracking should be written separately from the UI and include thorough unit tests.
